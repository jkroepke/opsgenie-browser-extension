import {defaultSettings, opsgenieDomain} from './shared.js'

(async () => {
    await renderAlerts()
})()

chrome.storage.session.onChanged.addListener(async () => {
    await renderAlerts()
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reload').addEventListener('click', e => {
        e.preventDefault()

        chrome.runtime.sendMessage({
            action: 'reload'
        }).then(error => error && window.alert(error))
    });
});

function sendMessage(e) {
    e.preventDefault();

    chrome.runtime.sendMessage({
        action: e.target.dataset.action,
        id: e.target.dataset.id,
    }).then(error => error && window.alert(error))
}

function createElement(tagName, text, className) {
    const e = document.createElement(tagName)
    e.textContent = text
    if (className !== undefined) {
        e.classList.add(className)
    }
    return e;
}

function createAlertActionElement(alert, settings) {
    const tdAlertAction = document.createElement("td")
    tdAlertAction.classList.add('alert-action')

    if (settings.username) {
        let a

        if (alert.acknowledged) {
            a = createElement('a', chrome.i18n.getMessage('popupAlertActionClose'), 'handleAlert');
            a.dataset.action = 'close'
        } else {
            a = createElement('a', chrome.i18n.getMessage('popupAlertActionAck'), 'handleAlert');
            a.dataset.action = 'acknowledge'
        }

        a.dataset.id = alert.id
        a.setAttribute('href', '#')
        a.addEventListener('click', sendMessage);
        tdAlertAction.appendChild(a)
    }
    return tdAlertAction;
}

function createAlertPriorityElement(alert) {
    const tdAlertPriority = document.createElement("td")
    const spanAlertPriority = createElement("span", alert.priority, "alert-priority")
    spanAlertPriority.classList.add(`${alert.priority}-bg`)
    tdAlertPriority.appendChild(spanAlertPriority)
    return tdAlertPriority;
}

function createAlertMessageElement(alert, settings) {
    const tdAlertMessage = createElement("td", alert.message, 'alert-message')
    tdAlertMessage.addEventListener('click', e => {
        e.preventDefault()

        window.open(`${opsgenieDomain(settings.customerName, settings.region)}/alert/detail/${e.target.parentElement.id}/details`, '_blank')
    });
    return tdAlertMessage;
}

async function renderAlerts() {
    const elemAlerts = document.getElementById("alerts")
    const elemInfo = document.getElementById("result")
    const settings = await chrome.storage.sync.get(defaultSettings)
    const {popup} = await chrome.storage.session.get('popup')
    elemAlerts.textContent = elemInfo.textContent = ''

    if (!popup) {
        elemInfo.appendChild(createElement('p', chrome.i18n.getMessage('popupLoading'), 'warning'))

        document.querySelectorAll('.warning').forEach(e => e.addEventListener('click', (e) => {
            e.preventDefault()
            chrome.runtime.openOptionsPage()
        }))

        return
    }

    if (!popup.ok) {
        popup.data.split('\n')
            .map(m => createElement('p', m, 'warning'))
            .forEach(e => elemInfo.appendChild(e))


        document.querySelectorAll('.warning').forEach(e => e.addEventListener('click', (e) => {
            e.preventDefault()
            chrome.runtime.openOptionsPage()
        }))

        return
    }

    const lastUpdate = createElement("i", `${chrome.i18n.getMessage('popupLastUpdated')} @ ${popup.time}`)
    elemInfo.appendChild(lastUpdate)

    const allAlertsLink = createElement("a", ` ${chrome.i18n.getMessage('popupSeeAllAlerts')}↗`, 'right')
    allAlertsLink.setAttribute('href', popup.ogUrl)
    allAlertsLink.setAttribute('target', '_blank')
    elemInfo.appendChild(allAlertsLink)

    if (popup.data.length === 0) {
        elemAlerts.appendChild(createElement("p", ` ${chrome.i18n.getMessage('popupNoAlerts')}  🎉`, 'center'))
    }

    popup.data.forEach(alert => {
        const tr = document.createElement("tr")
        tr.setAttribute('id', alert.id)
        tr.classList.add('alert')

        if (settings.enableAlertActions) {
            const tdAlertAction = createAlertActionElement(alert, settings);
            tr.appendChild(tdAlertAction);
        }

        const tdAlertCount = createElement("td", `x${alert.count}`, 'alert-count')
        tr.appendChild(tdAlertCount);

        const tdAlertPriority = createAlertPriorityElement(alert);
        tr.appendChild(tdAlertPriority);

        const tdAlertMessage = createAlertMessageElement(alert, settings);
        tr.appendChild(tdAlertMessage);

        elemAlerts.appendChild(tr)
    });
}
