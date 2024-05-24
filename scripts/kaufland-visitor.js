// ==UserScript==
// @name         Kaufland visitor
// @namespace    kaufland
// @version      2024.05.22
// @description  try to take over the world!
// @author       Dmitry.Pismennyy<dmitry.p@rebelinterner.eu>
// @match        https://www.kaufland.de/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kaufland.de
// ==/UserScript==

let SEARCH_DATA
try {
    SEARCH_DATA = JSON.parse(sessionStorage.getItem('searchData'))
} catch (e) {
    console.log(e)
}

const scrollOptions = {
    distance: 70,
    timeout: 20,
    wait: {
        timeout: 500,
        everyDistance: 200000
    }
}

async function scrollToBottom() {
    let prev;
    let tmp = 0;
    while(true) {
        if (window.scrollY === prev) {
            await wait(2000)
            if (window.scrollY === prev) break;
        }
        prev = window.scrollY;
        window.scrollBy(0, scrollOptions.distance);
        tmp += scrollOptions.distance
        if (tmp >= scrollOptions.wait.everyDistance) {
            await wait(scrollOptions.wait.timeout)
            tmp = 0;
        } else {
            await wait(scrollOptions.timeout)
        }
    }
}

async function scrollToTop() {
    while(window.scrollY > 0) {
        window.scrollBy(0, -scrollOptions.distance);
        await wait(scrollOptions.timeout)
    }
}

(async function() {
    'use strict';
     window.addEventListener('load', mainHandler);
})();

async function mainHandler() {
    await waitForState();
    console.dir(SEARCH_DATA)
    if (!SEARCH_DATA?.active) {
        stopBlinkingTitle()
        if (window.location.href === 'https://www.kaufland.de/') showForm();
        return;
    } else {
        createBlinkingTitle()
    }

    if (await handleHomePage()) return;
    if (await handleSearchPage()) return;
}

async function handleHomePage() {
    if (window.location.href !== 'https://www.kaufland.de/') return false;
    const textSearch = SEARCH_DATA.keyword;
    if (!textSearch) return true;

    const input = document.querySelector('input[name="search_value"]')
    await wait(300)
    await typeText(input, textSearch)
    await wait(100)
    const btn = Array.from(document.querySelectorAll('button.rh-search__button')).pop()
    btn.click();
    setTimeout(mainHandler, 0);
    return true;
}

async function handleSearchPage() {
    async function currentPage() {
        await waitForElement('span.rd-page--current')
        const item = document.querySelector('span.rd-page--current');
        return parseInt(item.innerText)
    }

    async function waitSearchPageLoaded() {
        await waitForState();
        await waitForElement('div.results article.product a.product-link')
        await scrollToBottom()
    }

    if (!window.location.href.includes('/s/')) return false;
    await waitSearchPageLoaded()

    const pageIndex = await currentPage();

    const element = await findProductOnPage(SEARCH_DATA.productId);
    if (element) {
        const index = await findProductIndexOnPage(SEARCH_DATA.productId);
        await element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.backgroundColor = 'red';
        const innerSpan = element.querySelector(':scope > span')
        if (innerSpan) {
            await moveMouseToElement(innerSpan)
            await triggerMouseEnter(innerSpan)
            await wait(500)
        }

        endWithSuccess(`FOUND on page ${pageIndex} on position ${index + 1}`)
        const innerLink = element.querySelector(':scope > a')
        innerLink.click()
        return true;
    }

    if (pageIndex >= SEARCH_DATA.maxPages) {
        endWithError('Done: all pages are searched')
        return true
    }

    const btn = document.querySelector('nav button.rd-page--button span.svg-icon--rotate90');
    if (!btn) {
        endWithError('Done: no more pages')
        return true;
    }

    btn.click()
    setTimeout(mainHandler, 0);
    return true;
}

// complete, interactive, loading
async function waitForState(states = ['complete'], timeout = 10000) {
    const endAt = new Date().getTime() + timeout;
    while (!states.includes(document.readyState)) {
        if (new Date().getTime() > endAt) {
            endWithError('Page is not loaded')
            return;
        }
        await wait(1000)
    }
}

function endWithError(message) {
    SEARCH_DATA.active = false;
    alert(message);
    throw new Error(message)
}

function endWithSuccess(message) {
    SEARCH_DATA.active = false;
    alert(message);
}

async function typeText(element, text, delay = 100) {
    let i = 0;
    while (i < text.length) {
        let char = text.charAt(i);
        let keydownEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: char });
        let keypressEvent = new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: char });
        let inputEvent = new Event('input', { bubbles: true, cancelable: true });
        let keyupEvent = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: char });

        element.dispatchEvent(keydownEvent);
        element.value += char;
        element.dispatchEvent(keypressEvent);
        element.dispatchEvent(inputEvent);
        element.dispatchEvent(keyupEvent);

        i++;
        await wait(delay)
    }
}

async function wait(delay = 100) {
    await new Promise(r => setTimeout(r, delay))
}

function waitForElement(selector) {
    const element = document.querySelector(selector);
    if (element) return element;
    return new Promise((resolve) => {
        const observer = new MutationObserver((mutations, me) => {
            const element = document.querySelector(selector);
            if (element) {
                me.disconnect(); // Stop observing
                resolve(element);
            }
        });

        observer.observe(document, {
            childList: true,
            subtree: true
        });
    });
}

 // Function to create and dispatch a mouse event
function createMouseEvent(type, x, y) {
    try {
        const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window.target,
            clientX: x,
            clientY: y
        });
        document.dispatchEvent(event);
    } catch (e) {
        console.log(e)
    }
}

function triggerFocusIn(element) {
    const focusInEvent = new FocusEvent('focusin', {
        view: window.target,
        bubbles: true,
        cancelable: true
    });
    element.dispatchEvent(focusInEvent);
}

function triggerMouseEnter(element) {
    const mouseEnterEvent = new MouseEvent('mouseenter', {
        view: window.target,
        bubbles: true,
        cancelable: true,
        clientX: element.getBoundingClientRect().left + (element.clientWidth / 2),
        clientY: element.getBoundingClientRect().top + (element.clientHeight / 2)
    });
    element.dispatchEvent(mouseEnterEvent);
}

// Function to simulate mouse movement from one point to another
function moveMouse(fromX, fromY, toX, toY, steps = 10, interval = 100) {
    let currentX = fromX;
    let currentY = fromY;
    const deltaX = (toX - fromX) / steps;
    const deltaY = (toY - fromY) / steps;
    let step = 0;

    function move() {
        if (step <= steps) {
            createMouseEvent('mousemove', currentX, currentY);
            currentX += deltaX;
            currentY += deltaY;
            step++;
            setTimeout(move, interval);
        } else {
            createMouseEvent('mousemove', toX, toY);
        }
    }
    move();
}

function moveMouseToElement(element) {
    const rect = element.getBoundingClientRect();
    const mouseMoveEvent = new MouseEvent('mousemove', {
        view: window.target,
        bubbles: true,
        cancelable: true,
        clientX: rect.left + (rect.width / 2),
        clientY: rect.top + (rect.height / 2)
    });
    element.dispatchEvent(mouseMoveEvent);
}

function scrollToElement(selector) {
    const element = document.querySelector(selector);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function findProductOnPage(id) {
    const index = await findProductIndexOnPage(id);
    return index >= 0 ? document.querySelectorAll('div.results article.product')[index] : undefined;
}

async function findProductIndexOnPage(id) {
    const products = await getProductsOnPage();
    return products.findIndex(item => item.id === id && !item.sponsored)
}

async function getProductsOnPage() {
    async function getData() {
        let data = unsafeWindow.__SEARCHFRONTEND__;
        while (!data) {
            window.location.reload();
            await wait(4000)
            await waitForState();
            data = unsafeWindow.__SEARCHFRONTEND__;
        }
        return data;
    }

    //withLinks ? 'div.results article.product a.product-link' : 'div.results article.product'
    const productElements = document.querySelectorAll('div.results article.product')
    const data = await getData();
    if (data.state.results.products.length !== productElements.length) {
        throw new Error(`Mismatch number products ${data.state.results.products.length} vs ${productElements.length}`)
    }
    const result = data.state.results.products
        .map(v => ({
            id: v.id.toString(),
            sponsored: !!v.sponsoredAdDetail
        }))

    console.log('FOUND:', result.map(i => i.id).join(", "))
    return result;
}

function getProductIdFromUrl(url) {
    const matches = url.match(/\/product\/(\d+)\//i);
    if (!matches || !matches.length) throw new Error(`Wrong url to Kaufland product ${url}`);
    return matches[1];
}

// Function to create and show the form
function showForm() {
    // Create a div to contain the form
    const formContainer = document.createElement('div');
    formContainer.style.position = 'fixed';
        formContainer.style.top = '50%';
        formContainer.style.left = '50%';
        formContainer.style.transform = 'translate(-50%, -50%)';
        formContainer.style.backgroundColor = '#333';
        formContainer.style.color = '#fff';
        formContainer.style.padding = '20px';
        formContainer.style.border = '2px solid #444';
        formContainer.style.borderRadius = '10px';
        formContainer.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
        formContainer.style.zIndex = '10000';
        formContainer.style.maxWidth = '300px';
        formContainer.style.width = '100%';


    // Create the form HTML
    formContainer.innerHTML = `
            <form id="inputForm">
                <label for="productId">Product id:</label><br>
                <input type="text" id="productId" name="productId" value="403251342"><br><br>
                <label for="keyword">Keyword:</label><br>
                <input type="text" id="keyword" name="keyword" value="t-shirt"><br><br>
                <label for="maxPages">Max pages</label><br>
                <input type="text" id="maxPages" name="maxPages" value="10"><br><br>
                <button type="submit">Run script</button>
                <button type="button" id="cancelButton">Cancel</button>
            </form>
        `;

    // Append the form container to the body
    document.body.appendChild(formContainer);

    // Handle form submission
    document.getElementById('inputForm').addEventListener('submit', function(event) {
        event.preventDefault();
        SEARCH_DATA = {
            maxPages: parseInt(document.getElementById('maxPages').value),
            keyword: document.getElementById('keyword').value,
            productId: document.getElementById('productId').value,
            active: true
        }
        console.log('Search data:', SEARCH_DATA);
        sessionStorage.setItem('searchData', JSON.stringify(SEARCH_DATA))
        // Remove the form after submission
        document.body.removeChild(formContainer);
        mainHandler()
    });

    // Handle form cancellation
    document.getElementById('cancelButton').addEventListener('click', function() {
        document.body.removeChild(formContainer);
    });
}

let titleInterval;

function stopBlinkingTitle() {
    if (titleInterval) clearInterval(titleInterval);
}

function createBlinkingTitle() {
    // Create a div to contain the title
    const titleDiv = document.createElement('div');
    titleDiv.textContent = 'AUTOMATION RUNNING...';
    titleDiv.style.position = 'fixed';
    titleDiv.style.top = '10px';
    titleDiv.style.left = '10px';
    titleDiv.style.backgroundColor = 'green';
    titleDiv.style.color = 'white';
    titleDiv.style.padding = '15px 20px';
    titleDiv.style.borderRadius = '5px';
    titleDiv.style.zIndex = '10000';
    titleDiv.style.fontSize = '16px';
    titleDiv.style.fontWeight = 'bold';
    titleDiv.style.textAlign = 'center';

    // Append the title div to the body
    document.body.appendChild(titleDiv);

    // Function to handle the blinking effect
    titleInterval = setInterval(() => {
        titleDiv.style.visibility = (titleDiv.style.visibility === 'hidden') ? 'visible' : 'hidden';
    }, 500); // Blink interval in milliseconds
}