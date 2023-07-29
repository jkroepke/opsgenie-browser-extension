chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'session') {
        return renderAlerts()
    }
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('reload').addEventListener('click', (e) => {
        e.preventDefault()

        chrome.runtime.sendMessage({
            action: 'reload'
        }, (error) => {
            if (error) {
                window.alert(error)
            }
        })
    });
});

(async () => {
    await renderAlerts()
})()

function sendMessage(e) {
    e.preventDefault();

    chrome.runtime.sendMessage({
        action: e.target.dataset.action,
        id: e.target.dataset.id,
    }, (error) => {
        if (error) {
            window.alert(error)
        }
    })
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
            a = createElement('a', '[CLOSE]', 'handleAlert');
            a.dataset.action = 'close'
        } else {
            a = createElement('a', '[ACK]', 'handleAlert');
            a.dataset.action = 'ack'
        }

        a.dataset.id = alert.id
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

        let url = "https://"
        if (settings.customerName !== '') {
            url += `${settings.customerName}.`
        }
        url += `app.opsgenie.com/alert/detail/${e.target.parentElement.id}/details`

        window.open(url, '_blank')
    });
    return tdAlertMessage;
}

async function renderAlerts() {
    const elemAlerts = document.getElementById("alerts")
    const elemInfo = document.getElementById("result")
    const settings = await chrome.storage.sync.get()
    const {popup} = await chrome.storage.session.get('popup')
    elemAlerts.textContent = elemInfo.textContent = ''

    if (!popup) {
        elemInfo.appendChild(createElement('p', 'Loading ...', 'warning'))
        return
    }

    if (!popup.ok) {
        elemInfo.appendChild(createElement('p', popup.data, 'warning'))
        return
    }

    const lastUpdate = createElement("i", `Last updated @ ${popup.time}`)
    elemInfo.appendChild(lastUpdate)

    const allAlertsLink = createElement("a", ` see all alerts↗`, 'right')
    allAlertsLink.setAttribute('href', popup.ogUrl)
    allAlertsLink.setAttribute('target', '_blank')
    elemInfo.appendChild(allAlertsLink)

    if (popup.data.length === 0) {
        elemAlerts.appendChild(createElement("p", ' There are no alerts.  🎉', 'center'))
    }

    popup.data.forEach(alert => {
        const tr = document.createElement("tr")
        tr.setAttribute('id', alert.id)
        tr.classList.add('alert')

        const tdAlertAction = createAlertActionElement(alert, settings);
        tr.appendChild(tdAlertAction);

        const tdAlertCount = createElement("td", `x${alert.count}`, 'alert-count')
        tr.appendChild(tdAlertCount);

        const tdAlertPriority = createAlertPriorityElement(alert);
        tr.appendChild(tdAlertPriority);

        const tdAlertMessage = createAlertMessageElement(alert, settings);
        tr.appendChild(tdAlertMessage);

        elemAlerts.appendChild(tr)
    });
}
