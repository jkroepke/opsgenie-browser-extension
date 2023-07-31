import {OPSGENIE_DOMAIN, defaultSettings, opsgenieDomain} from './js/shared.js'

const notificationPriorityMap = {
    "P1": 2,
    "P2": 1,
    "P3": 0,
    "P4": 0,
    "P5": 0,
}

console.log("init");

(async () => {
    await initExtension();
})();

chrome.runtime.onInstalled.addListener(async details => {
    if (details.reason === 'install') {
        chrome.runtime.openOptionsPage()
    }

    await initExtension();
});

chrome.storage.sync.onChanged.addListener(async () => {
    if (chrome.notifications != null) {
        chrome.notifications.onClicked.addListener((notificationId) => {
            (async () => {
                const settings = await chrome.storage.sync.get(defaultSettings)
                if (notificationId === 'opsgenie-alert-list') {
                    await chrome.tabs.create({
                        url: `${opsgenieDomain(settings.customerName)}/alert/list?query=${encodeURI(settings.query)}`
                    });
                } else {
                    await chrome.tabs.create({
                        url: `${opsgenieDomain(settings.customerName)}/alert/detail/${notificationId}/details`
                    });
                }
            })();

            return true;
        });
    }

    await initExtension();
});

chrome.alarms.onAlarm.addListener(async alarm => {
    switch (alarm.name) {
        case 'fetch':
            await doExecute(await chrome.storage.sync.get(defaultSettings));
            break
        }
    }
)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) return;

    (async () => {
        switch (message.action) {
            case 'reload':
                await doExecute(await chrome.storage.sync.get(defaultSettings));
                break
            default:
                await handleAlertAction(message, sendResponse);
                break
        }
    })();

    return true;
});


async function initExtension() {
    setBadge(-1)
    await startExecution()
}

async function startExecution() {
    const settings = await chrome.storage.sync.get(defaultSettings)

    if (!settings.enabled) {
        setBadge(-1)
        setPopupData(false, settings, chrome.i18n.getMessage("popupExtensionDisabled"))
        return
    }

    if (settings.apiKey === "") {
        setBadge(-1)
        setPopupData(false, settings, chrome.i18n.getMessage("popupApiKeyEmpty"))
        return
    }

    await chrome.alarms.clear('fetch')
    await chrome.alarms.create('fetch', {
        periodInMinutes: parseInt(settings.timeInterval) || 1
    });

    return doExecute(settings)
}

async function doExecute(settings) {
    if (!settings.enabled) {
        setBadge(-1)
        setPopupData(false, settings, chrome.i18n.getMessage("popupExtensionDisabled"))
        return
    }

    let response;

    try {
        response = await fetch(`https://api.${OPSGENIE_DOMAIN[settings.region]}/v2/alerts?limit=100&sort=createdAt&query=${encodeURI(settings.query)}`, {
            headers: {
                "Authorization": `GenieKey ${settings.apiKey}`
            }
        })
    } catch (error) {
        setBadge(-1)
        setPopupData(false, settings, chrome.i18n.getMessage("popupNetworkFailure", [settings.timeInterval, error]))
        return
    }

    if (response.status !== 200) {
        setBadge(-1)
        try {
            let errorMessage;
            try {
                const responseBody = await response.json()
                errorMessage = responseBody.message
            } catch (e) {
                errorMessage = await response.text()
            }

            setPopupData(false, settings, chrome.i18n.getMessage("popupClientFailure", [settings.timeInterval, errorMessage]))
        } catch (error) {
            setPopupData(false, settings, chrome.i18n.getMessage("popupClientFailure", [settings.timeInterval, error]))
        }

        return
    }

    try {
        const responseBody = await response.json()
        setBadge(responseBody.data.length)
        setPopupData(true, settings, responseBody.data)
        if (settings.enableNotifications) {
            await sendNotificationIfNewAlerts(responseBody.data)
        }
    } catch (error) {
        setPopupData(false, settings, chrome.i18n.getMessage("popupClientFailure", [settings.timeInterval, error]))
    }
}

function setBadge(count) {
    if (count > 0) {
        // red badge with alert count
        chrome.action.setBadgeText({text: count.toString()})
        chrome.action.setBadgeBackgroundColor({color: '#BF2600'})
        chrome.action.setBadgeTextColor({color: '#EEEEEE'})
    } else if (count < 0) {
        // remove badge, no response alert api yet
        chrome.action.setBadgeText({text: ''})
    } else {
        chrome.action.setBadgeBackgroundColor({color: '#00875A'})
        chrome.action.setBadgeText({text: ' '})
    }
}

function setPopupData(ok, settings, data) {
    const popup = {
        ok: ok,
        data: data,
        time: new Date().toLocaleString(),
        ogUrl: `${opsgenieDomain(settings.customerName)}/alert/list?query=${encodeURI(settings.query)}`
    }

    chrome.storage.session.set({popup})
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

    if (latestAlertDate === undefined || !(latestAlertDate instanceof Date) || isNaN(latestAlertDate)) {
        latestAlertDate = new Date(Math.max(...alerts.map(alert => alert.createdAt)));
        await chrome.storage.local.set({latestAlertDate: latestAlertDate.toISOString()})
    }

    const newAlerts = alerts.filter(alert => latestAlertDate < alert.createdAt)
        .map(alert => {
            return {
                id: alert.id,
                title: alert.message,
                message: `Priority: ${alert.priority}`,
                createdAt: alert.createdAt,
                priority: alert.priority
            }
        })

    if (newAlerts.length > 0) {
        await chrome.storage.local.set({latestAlertDate: latestAlertDate.toISOString()})

        if (newAlerts.length === 1) {
            return chrome.notifications.create(newAlerts[0].id, {
                type: 'image',
                title: newAlerts[0].title,
                message: newAlerts[0].message,
                iconUrl: 'images/128x128.png',
                priority: notificationPriorityMap[newAlerts[0].priority] ?? 0,
                silent: notificationPriorityMap[newAlerts[0].priority] === 0,
                requireInteraction: notificationPriorityMap[newAlerts[0].priority] === 2,
                eventTime: newAlerts[0].createdAt,
            });
        } else {
            return chrome.notifications.create('opsgenie-alert-list', {
                type: 'list',
                iconUrl: 'images/128x128.png',
                title: newAlerts.length.toString() + " new alerts!",
                message: "",
                items: newAlerts.map(alert => { return {title: alert.title, message: alert.message}}),
            });
        }
    }
}


async function handleAlertAction(message, sendResponse) {
    try {
        const settings = await chrome.storage.sync.get(defaultSettings)
        const response = await fetch(`https://api.${OPSGENIE_DOMAIN[settings.region]}/v2/alerts/${message.id}/${message.action}`, {
            method: "POST",
            headers: {
                "Authorization": `GenieKey ${settings.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "user": settings.username,
                "source": "OpsGenie Notifier",
                "note": "Action executed via Alert API"
            })
        })

        if (response.status !== 200) {
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
