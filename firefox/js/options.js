import {OPSGENIE_DOMAIN} from '../shared.js'

document.querySelector('title').textContent = chrome.i18n.getMessage('optionsTitle');
document.querySelector('label[for=enabled]').textContent = chrome.i18n.getMessage('optionsEnabled');
document.querySelector('label[for=region]').textContent = chrome.i18n.getMessage('optionsRegion');
document.querySelector('label[for=customer-name]').textContent = chrome.i18n.getMessage('optionsCustomerName');
document.querySelector('label[for=username]').textContent = chrome.i18n.getMessage('optionsUsername');
document.querySelector('label[for=api-key]').textContent = chrome.i18n.getMessage('optionsApiKey') + " ";
document.querySelector('label[for=query]').textContent = chrome.i18n.getMessage('optionsAlertQuery');
document.querySelector('label[for=time-interval]').textContent = chrome.i18n.getMessage('optionsTimeInterval');
document.querySelector('label[for=popup-height]').textContent = chrome.i18n.getMessage('optionPopupHeight');
document.querySelector('button').textContent = chrome.i18n.getMessage('optionsButtonSave');

const helpApiKey = document.createElement('a')
helpApiKey.setAttribute('href', "https://support.atlassian.com/opsgenie/docs/api-key-management/")
helpApiKey.setAttribute('target', "_blank")
helpApiKey.textContent = chrome.i18n.getMessage('optionsApiKeyHelp')
document.querySelector('label[for=api-key]').appendChild(helpApiKey)

document.addEventListener('DOMContentLoaded', async () => {
    const settings = await chrome.storage.sync.get({
        enabled: true,
        region: 'US',
        customerName: '',
        apiKey: '',
        username: '',
        timeInterval: 1,
        query: '',
        popupHeight: 300,
    });

    document.getElementById('enabled').checked = settings.enabled
    document.getElementById('region').value = settings.region;
    document.getElementById('customer-name').value = settings.customerName;
    document.getElementById('api-key').value = settings.apiKey;
    document.getElementById('username').value = settings.username;
    document.getElementById('query').value = settings.query;
    document.getElementById('time-interval').value = parseInt(settings.timeInterval)
    document.getElementById('popup-height').value = parseInt(settings.popupHeight)
});


document.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault()

    const formAlert = document.getElementById('form-alert')

    formAlert.value = ""

    try {
        const permissionGrantedOrigins = await chrome.permissions.request({
            origins: [`https://api.${OPSGENIE_DOMAIN[document.getElementById('region').value]}/v2/*`]
        })
        const permissionGrantedNotifications = await chrome.permissions.request({
            permissions: ['notifications'],
        })

        await chrome.storage.sync.set({
            enabled: document.getElementById('enabled').checked,
            region: document.getElementById('region').value,
            customerName: document.getElementById('customer-name').value,
            apiKey: document.getElementById('api-key').value,
            username: document.getElementById('username').value,
            query: document.getElementById('query').value,
            timeInterval: parseInt(document.getElementById('time-interval').value) || 1,
            popupHeight: parseInt(document.getElementById('popup-height').value) || 300,
        })

        formAlert.textContent = permissionGrantedOrigins && permissionGrantedNotifications ? chrome.i18n.getMessage('optionsSaved') : chrome.i18n.getMessage('optionsPermissionDenied');
    } catch (error) {
        formAlert.textContent = error;
    }
});
