// ==UserScript==
// @name         Alibaba visitor
// @namespace    http://tampermonkey.net/
// @version      2024-05-26
// @description  Alibaba visitor
// @author       You
// @match        https://www.alibaba.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=alibaba.com
// @grant        GM_addStyle
// ==/UserScript==

const Step = {
    INPUT_PRICE: 'INPUT_PRICE',
    SEARCHING: 'SEARCHING'
}

let SEARCH_DATA
try {
    SEARCH_DATA = JSON.parse(sessionStorage.getItem('searchData'))
} catch (e) {
    console.log(e)
}

function setSearchData(value) {
    SEARCH_DATA = {...SEARCH_DATA, ...value}
    sessionStorage.setItem('searchData', JSON.stringify(SEARCH_DATA))
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
    mainHandler()
    //window.addEventListener('load', mainHandler);
})();

async function mainHandler() {
    try {
        console.dir('Main handler:', SEARCH_DATA)
        await waitForState();
        if (
            window.location.href === 'https://www.alibaba.com/'
            && (!SEARCH_DATA.step || SEARCH_DATA.step === Step.SEARCHING)
        ) {
            setSearchData({step: undefined})
        };
        if (!SEARCH_DATA?.step) {
            stopBlinkingTitle()
            if (window.location.href === 'https://www.alibaba.com/') {
                await wait(1000);
                showForm();
            }
            return;
        } else {
            createBlinkingTitle()
        }

        if (await handleHomePage()) return;
        if (await handleSearchPage()) return;
    } catch (e) {
        console.error(e)
        endWithError(e.toString())
    }
}

async function handleHomePage() {
    if (window.location.href !== 'https://www.alibaba.com/') return false;
    const textSearch = SEARCH_DATA.keyword;
    if (!textSearch) return true;
    console.log('TEXT:',textSearch)

    await wait(300)
    const input = await waitForElement('input.search-bar-input')
    await typeText(input, textSearch)
    await wait(300)
    document.querySelector('div[data-spm="search"] button').click();
    return true;
}

function simulateReactChange(element) {
    const event = new Event('input', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { writable: false, value: element });
    element.dispatchEvent(event);

    const event2 = new Event('change', { bubbles: true, cancelable: true });
    Object.defineProperty(event2, 'target', { writable: false, value: element });
    element.dispatchEvent(event2);
}

async function handleSearchPage() {
    async function currentPage() {
        const selector = 'div.seb-pagination__pages span.active'
        const item = await waitForElement(selector);
        return parseInt(item.innerText)
    }

    async function waitSearchPageLoaded() {
        await waitForState();
        await waitForElement('div.app-organic-search__main-body div.organic-list')
        await scrollToBottom()
    }

    if (!window.location.href.includes('/search')) return false;
    await waitSearchPageLoaded()

    if (SEARCH_DATA.step === Step.INPUT_PRICE) {
        const inputs = await waitForElements('div.filter-price-group input')
        const anchor = document.querySelector('div.filter-price-group a.price-ok')
        let needClick = false;
        if (SEARCH_DATA.minPrice) {
            inputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            await typeText(inputs[0], SEARCH_DATA.minPrice.toString())
            await wait(300)
            anchor.href = anchor.href.replace('pricef=', 'pricef='+SEARCH_DATA.minPrice)
            needClick = true;
        }
        if (SEARCH_DATA.maxPrice) {
            inputs[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
            await typeText(inputs[1], SEARCH_DATA.maxPrice.toString())
            await wait(300)
            anchor.href = anchor.href.replace('pricet=', 'pricet='+SEARCH_DATA.maxPrice)
            needClick = true;
        }

        // TODO: input price values do not cause change event on 'div.app-organic-search__left-body'
        // On that event value of link is modified in anchor 'div.filter-price-group a.price-ok'
        // which is clicked to apply prices. For now I just manually modify href of the link

        setSearchData({step: Step.SEARCHING})
        if (needClick) {
            document.querySelector('div.filter-price-group a.price-ok').click();
            return true;
        }
    }

    const pageIndex = await currentPage();

    const element = await findProductOnPage(SEARCH_DATA.productId);
    if (element) {
        const index = await findProductIndexOnPage(SEARCH_DATA.productId);
        element.style.backgroundColor = 'red';
        await element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(500);
        endWithSuccess(`FOUND on page ${pageIndex} on position ${index + 1}`)
        const innerLink = element.querySelector(':scope a')
        innerLink.click()
        return true;
    }

    if (pageIndex >= SEARCH_DATA.maxPages) {
        endWithError('Done: all pages are searched')
        return true
    }

    const btn = document.querySelector('div.seb-pagination__pages a.pages-next');
    if (!btn || btn.classList.contains('disabled')) {
        endWithError('Done: no more pages')
        return true;
    }

    btn.click()
    return true;
}

// complete, interactive, loading
async function waitForState(states = ['complete', 'interactive'], timeout = 10000) {
    const endAt = new Date().getTime() + timeout;
    while (!states.includes(document.readyState)) {
        console.log(document.readyState)
        if (new Date().getTime() > endAt) {
            endWithError('Page is not loaded')
            return;
        }
        await wait(1000)
    }
}

function endWithError(message) {
    setSearchData({step: undefined})
    stopBlinkingTitle();
    alert(message);
}

function endWithSuccess(message) {
    setSearchData({step: undefined})
    stopBlinkingTitle();
    alert(message);
}

async function typeText(element, text, delay = 100) {
    await moveMouseToElement(element)
    await triggerMouseClick(element)
    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    let i = 0;
    while (i < text.length) {
        const char = text.charAt(i);
        const keydownEvent = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: char });
        const keypressEvent = new KeyboardEvent('keypress', { bubbles: true, cancelable: true, key: char });
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        const keyupEvent = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: char });

        element.dispatchEvent(keydownEvent);
        element.value += char;
        element.dispatchEvent(keypressEvent);
        element.dispatchEvent(inputEvent);
        element.dispatchEvent(keyupEvent);

        i++;
        await wait(delay)
    }
    element.dispatchEvent(changeEvent);
}

async function wait(delay = 100) {
    await new Promise(r => setTimeout(r, delay))
}

async function waitForElements(selector, timeout = 5000) {
    const elements = document.querySelectorAll(selector);
    if (elements.length) return elements;
    return new Promise((resolve, reject) => {
        const observer = new MutationObserver((mutations, me) => {
            const elements = document.querySelectorAll(selector);
            if (elements.length) {
                me.disconnect(); // Stop observing
                resolve(elements);
            }
        });

        observer.observe(document, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error('Timeout waiting for elements: ' + selector));
        }, timeout);
    });
}

function getParentWithClass(element, className) {
    while (element && !element.classList.contains(className)) {
        element = element.parentElement;
    }
    return element;
}

async function waitForElement(selector, timeout = 5000) {
    return (await waitForElements(selector, timeout))[0]
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

function triggerMouseClick(element) {
    var event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window.target
    });
    element.dispatchEvent(event);
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

function findProductOnPage(id) {
    return document.querySelector(`div.app-organic-search__main-body div.organic-list div[data-ctrdot="${id}"]`)
}

function findProductIndexOnPage(id) {
    const products = getProductsOnPage();
    return products.findIndex(el => el.dataset.ctrdot === id);
}

function getProductsOnPage() {
    const items = document.querySelectorAll(`div.app-organic-search__main-body div.organic-list div[data-ctrdot]`)
    return !items.length ? [] : Array.from(items)
}

function getProductIdFromUrl(url) {
    const matches = url.match(/\/(\d+)\.html/i);
    if (!matches || !matches.length) throw new Error(`Wrong url to alibaba product ${url}`);
    return matches[1];
}

function extractInt(value) {
    const int = parseInt(value)
    return isNaN(int) ? undefined : Math.floor(int);
}
// Function to create and show the form
function showForm() {
    // Create a div to contain the form
    const formContainer = document.createElement('div');
    formContainer.id = 'dark-form-container'

    GM_addStyle(`
        #dark-form-container {
            position: fixed;
            top: 30%;
            left: 50%;
            transform: translate(-50%, 0);
            background-color: #333;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
            color: #fff;
            max-width: 250px;
            width: 100%;
            z-index: 1000;
        }

        #inputForm label {
            margin-bottom: 5px;
            font-weight: bold;
        }

        #inputForm input[type="text"],
        #inputForm button {
            padding: 10px;
            border: none;
            border-radius: 5px;
            background: linear-gradient(145deg, #555, #777);
            color: #fff;
            cursor: pointer;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
            transition: background 0.3s ease, transform 0.3s ease;
        }

        #inputForm button:hover {
            background-color: #666;
        }
    `);


    // Create the form HTML
    formContainer.innerHTML = `
            <form id="inputForm">
                <label for="productId">Product id:</label><br>
                <input type="text" id="productId" name="productId" value="1600930534720"><br><br>
                <label for="keyword">Keyword:</label><br>
                <input type="text" id="keyword" name="keyword" value="iphone 15 pro max"><br><br>
                <label for="maxPages">Max pages</label><br>
                <input type="text" id="maxPages" name="maxPages" value="10"><br><br>
                <label for="minPrice">Price (optional):</label><br/>
                <input type="text" style="width: 90px" id="minPrice" name="minPrice" placeholder="Min" value="">
                &nbsp;-&nbsp;
                <input type="text" style="width: 90px" id="maxPrice" name="maxPrice" placeholder="Max" value=""><br><br>
                <button type="submit">Run script</button>
                <button type="button" style="margin-left: 53px; color: #aaa" id="cancelButton">Cancel</button>
            </form>
        `;

    // Append the form container to the body
    document.body.appendChild(formContainer);

    // Handle form submission
    document.getElementById('inputForm').addEventListener('submit', function(event) {
        event.preventDefault();
        setSearchData({
            maxPages: extractInt(document.getElementById('maxPages').value),
            minPrice: extractInt(document.getElementById('minPrice').value),
            maxPrice: extractInt(document.getElementById('maxPrice').value),
            keyword: document.getElementById('keyword').value,
            productId: document.getElementById('productId').value,
            step: Step.INPUT_PRICE
        })
        console.log('Search data:', SEARCH_DATA);
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
    if (titleInterval) {
        clearInterval(titleInterval);
        titleInterval = undefined
    }
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