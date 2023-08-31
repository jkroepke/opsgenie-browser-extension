import {OPSGENIE_DOMAIN, defaultSettings, opsgenieDomain} from './js/shared.js'

const notificationPriorityMap = {
    "P1": 2,
    "P2": 1,
    "P3": 0,
    "P4": 0,
    "P5": 0,
}

console.log("init");

chrome.runtime.onInstalled.addListener(async details => {
    if (details.reason === 'install') {
        chrome.runtime.openOptionsPage()
    }

    return initExtension();
});

chrome.runtime.onStartup.addListener(async () => {
    return initExtension();
});

chrome.storage.sync.onChanged.addListener(async () => {
    return initExtension();
});

chrome.alarms.onAlarm.addListener(async alarm => {
    switch (alarm.name) {
        case 'fetch':
            return doExecute(await chrome.storage.sync.get(defaultSettings));
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return;

    (async () => {
        switch (message.action) {
            case 'reload':
                return doExecute(await chrome.storage.sync.get(defaultSettings));
            default:
                return handleAlertAction(message, sendResponse);
        }
    })();

    return true;
});


if (chrome.permissions.onRemoved) {
    chrome.permissions.onRemoved.addListener(async permissions => {
        if (permissions.permissions.includes('notifications')) {
            chrome.notifications.onClicked.removeListener(notificationListener);

            return chrome.storage.sync.set({
                enableNotifications: false
            })
        }
    })
}

async function notificationListener(notificationId) {
    const settings = await chrome.storage.sync.get(defaultSettings)
    if (notificationId === 'opsgenie-alert-list') {
        return chrome.tabs.create({
            url: `${opsgenieDomain(settings.customerName, settings.region)}/alert/list?query=${encodeURI(settings.query)}`
        });
    } else {
        return chrome.tabs.create({
            url: `${opsgenieDomain(settings.customerName, settings.region)}/alert/detail/${notificationId}/details`
        });
    }
}

async function initExtension() {
    if (chrome.notifications != null && !chrome.notifications.onClicked.hasListener(notificationListener)) {
        chrome.notifications.onClicked.addListener(notificationListener);
    }

    return startExecution()
}

function setPopupError(settings, message, placeholders) {
    return Promise.all([
        setBadge(-1),
        setPopupData(false, settings, chrome.i18n.getMessage(message, placeholders))
    ])
}

async function startExecution() {
    const settings = await chrome.storage.sync.get(defaultSettings)

    if (!settings.enabled) {
        return setPopupError(settings, "popupExtensionDisabled");
    }

    if (settings.apiKey === "") {
        return setPopupError(settings, "popupApiKeyEmpty")
    }

    return Promise.all([
        chrome.alarms.create('fetch', {
            periodInMinutes: parseInt(settings.timeInterval) || 1
        }),
        doExecute(settings)
    ])
}

async function doExecute(settings) {
    if (!settings.enabled) {
        return setPopupError("popupExtensionDisabled")
    }

    let response;

    try {
        response = await fetch(`https://api.${OPSGENIE_DOMAIN[settings.region]}/v2/alerts?limit=100&sort=createdAt&query=${encodeURI(settings.query)}`, {
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
            referrerPolicy: "no-referrer",

            headers: {
                "Accept": "application/json",
                "Authorization": `GenieKey ${settings.apiKey}`
            }
        })
    } catch (error) {
        return setPopupError(settings, "popupNetworkFailure", [settings.timeInterval, error])
    }

    if (!response.ok || response.status !== 200) {
        try {
            let errorMessage;
            try {
                const responseBody = await response.json()
                errorMessage = responseBody.message
            } catch (e) {
                errorMessage = await response.text()
            }

            return setPopupError(settings, "popupClientFailure", [settings.timeInterval, errorMessage])
        } catch (error) {
            return setPopupError(settings, "popupClientFailure", [settings.timeInterval, error])
        }
    }

    try {
        const responseBody = await response.json()
        const promises = []
        promises.push(setBadge(responseBody.data.length))
        promises.push(setPopupData(true, settings, responseBody.data))

        if (settings.enableNotifications) {
            promises.push(sendNotificationIfNewAlerts(responseBody.data))
        }
        return Promise.all(promises)
    } catch (error) {
        return setPopupError("popupClientFailure", [settings.timeInterval, error])
    }
}

async function setBadge(count) {
    if (count > 0) {
        // red badge with alert count
        return Promise.all([
            chrome.action.setBadgeText({text: count.toString()}),
            chrome.action.setBadgeBackgroundColor({color: '#BF2600'}),
            chrome.action.setBadgeTextColor({color: '#EEEEEE'})
        ])
    } else if (count < 0) {
        // remove badge, no response alert api yet
        return chrome.action.setBadgeText({text: ''})
    } else {
        return Promise.all([
            chrome.action.setBadgeBackgroundColor({color: '#00875A'}),
            chrome.action.setBadgeText({text: ' '})
        ])
    }
}

async function setPopupData(ok, settings, data) {
    return chrome.storage.session.set({
        popup: {
            ok: ok,
            data: data,
            time: new Date().toLocaleString(),
            ogUrl: `${opsgenieDomain(settings.customerName, settings.region)}/alert/list?query=${encodeURI(settings.query)}`
        }
    })
}

async function sendNotificationIfNewAlerts(data) {
    if (data.length === 0) {
        return
    }

    let {latestAlertDate} = await chrome.storage.local.get('latestAlertDate')
    latestAlertDate = new Date(latestAlertDate)

    const alerts = data.map(alert => {
        alert.createdAt = new Date(alert.createdAt)
        return alert
    })

    let newAlerts = [];
    if (!(latestAlertDate === undefined || !(latestAlertDate instanceof Date) || isNaN(latestAlertDate))) {
        newAlerts = alerts
            .filter(alert => latestAlertDate < alert.createdAt)
            .map(alert => {
                return {
                    id: alert.id,
                    title: alert.message,
                    message: `Priority: ${alert.priority}`,
                    createdAt: alert.createdAt,
                    priority: alert.priority
                }
            })
    }

    latestAlertDate = new Date(Math.max(...alerts.map(alert => alert.createdAt)));

    if (newAlerts.length > 0) {
        await chrome.storage.local.set({latestAlertDate: latestAlertDate.getTime()})

        if (newAlerts.length === 1) {
            return chrome.notifications.create(newAlerts[0].id, {
                type: 'basic',
                title: newAlerts[0].title,
                message: newAlerts[0].message,
                iconUrl: 'images/128x128.png',
                priority: notificationPriorityMap[newAlerts[0].priority] ?? 0,
                silent: notificationPriorityMap[newAlerts[0].priority] === 0,
                requireInteraction: notificationPriorityMap[newAlerts[0].priority] === 2,
                eventTime: newAlerts[0].createdAt.getTime(),
            })
        } else {
            return chrome.notifications.create('opsgenie-alert-list', {
                type: 'list',
                title: `${newAlerts.length.toString()} new alerts!`,
                iconUrl: 'images/128x128.png',
                message: "",
                items: newAlerts.map(alert => {
                    return {title: alert.title, message: alert.message}
                }),
                eventTime: latestAlertDate.getTime()
            })
        }
    }
}


async function handleAlertAction(message, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(defaultSettings)
        const response = await fetch(`https://api.${OPSGENIE_DOMAIN[settings.region]}/v2/alerts/${message.id}/${message.action}`, {
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
            referrerPolicy: "no-referrer",

            method: "POST",
            headers: {
                "Authorization": `GenieKey ${settings.apiKey}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "user": settings.username,
                "source": "OpsGenie Notifier",
                "note": "Action executed via Alert API"
            })
        })

        if (!response.ok || response.status !== 200) {
            try {
                const responseText = await response.json()
                sendResponse(`ERROR: ${responseText.message}`)
            } catch (e) {
                const responseText = await response.text()
                sendResponse(`ERROR: ${responseText}`)
            }
        } else {
            sendResponse('OK')
        }
    } catch (error) {
        sendResponse(`ERROR: ${error}`)
    }
}
