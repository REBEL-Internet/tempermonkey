const RELEASE_DATE = '2024.06.10'
const UTILS_VERSION = '1.0.1'
console.log(`Utils version: ${UTILS_VERSION} at ${RELEASE_DATE}`)

const Step = {
    INPUT_PRICE: 'INPUT_PRICE',
    SEARCHING: 'SEARCHING'
}

let SEARCH_DATA
try {
    SEARCH_DATA = JSON.parse(sessionStorage.getItem('searchData'))
} catch (e) {
    console.log(e)
    setSearchData({})
}

function setSearchData(value) {
    SEARCH_DATA = {...SEARCH_DATA, ...value}
    sessionStorage.setItem('searchData', JSON.stringify(SEARCH_DATA))
}

const scrollOptions = {
    distance: 60,
    timeout: 15,
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

function extractInt(value) {
    const int = parseInt(value)
    return isNaN(int) ? undefined : Math.floor(int);
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

function showStartVisitorForm(formData) {
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
            max-width: 300px;
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
                <label for="productId">Product id:</label><br/>
                <input type="text" id="productId" name="productId" value="1600930534720"><br/><br/>
                <label for="keyword">Keyword:</label><br/>
                <input type="text" id="keyword" name="keyword" value="iphone 15 pro max"><br/><br/>
                <label for="maxPages">Max pages</label><br/>
                <input type="text" id="maxPages" name="maxPages" value="10"><br/><br/>
                <label for="startPage">Start page</label><br/>
                <input type="text" id="startPage" name="startPage" value="1"><br/><br/>
                <label for="minPrice">Price (optional):</label><br/>
                <input type="text" style="width: 95px" id="minPrice" name="minPrice" placeholder="Min" value="">
                &nbsp;-&nbsp;
                <input type="text" style="width: 95px" id="maxPrice" name="maxPrice" placeholder="Max" value=""><br/><br/>
                <button type="submit">Run script</button>
                <button type="button" style="margin-left: 53px; color: #aaa" id="cancelButton">Cancel</button><br/><br/>
                <span><small>v. ${formData?.version ?? '???'}</small></span>
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
            startPage: extractInt(document.getElementById('startPage').value),
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