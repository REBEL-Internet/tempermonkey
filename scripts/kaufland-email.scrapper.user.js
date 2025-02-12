// ==UserScript==
// @name         Kaufland Email Scrapper
// @namespace    kaufland
// @version      2025.02.12.002
// @description
// @author       Dmitry.Pismennyy<dmitry.p@rebelinterner.eu>
// @match        https://www.kaufland.de/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kaufland.de
// @require      http://localhost:8000/utils.js
// @require      https://raw.githubusercontent.com/REBEL-Internet/tempermonkey/main/releases/1.0.2/utils.js
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// ==/UserScript==

const MAIN_SCRIPT_VERSION = '2025.02.12.002'
const MAIN_PAGE_URL = 'https://www.kaufland.de/';

(async function() {
    'use strict';
    window.addEventListener('load', mainHandler);
})();


if (!localStorage.getItem('sellers')) {
    localStorage.setItem('sellers', JSON.stringify({}))
}

if (!localStorage.getItem('categoryUrls')) {
    localStorage.setItem('categoryUrls', JSON.stringify([]))
}


let titleDiv;

function incErrorCnt() {
    setSearchData({errorsCnt: SEARCH_DATA.errorsCnt + 1})
}

function updateTitleDiv() {
    const categories = getCategoryUrls();
    const sellers = getSellers();
    const text = `RUNNING. Categories: ${Object.keys(categories).length}; Sellers: ${Object.keys(sellers)?.length};  Errors: ${SEARCH_DATA?.errorsCnt ?? 0}`
    if (!titleDiv) {
        titleDiv = createInfoTitle(text)
    } else {
        titleDiv.textContent = text
    }
}

//========CATEGORIES==========================================

function resetCategoryUrls() {
    localStorage.setItem('categoryUrls', JSON.stringify([]));
    updateTitleDiv()
}

function addCategoryUrl(categoryUrl) {
    const existed = getCategoryUrls()
    const set = new Set(existed);
    set.add(categoryUrl)
    const modified = Array.from(set);
    localStorage.setItem('categoryUrls', JSON.stringify(modified));
    updateTitleDiv()
}

function popNextCategoryUrl() {
    const existed = getCategoryUrls()
    if (!existed.length) return null;
    const url = existed.pop();
    localStorage.setItem('categoryUrls', JSON.stringify(existed));
    updateTitleDiv()
    return url;
}

function getCategoryUrls() {
    try {
        const urls = JSON.parse(localStorage.getItem('categoryUrls'))
        if (Array.isArray(urls)) return urls;
    } catch (e) {
    }
    localStorage.setItem('categoryUrls', JSON.stringify([]))
    return [];
}

//======SELLERS===================================================

function resetSellers() {
    localStorage.setItem('sellers', JSON.stringify({}));
    updateTitleDiv()
}

function addSeller(seller) {
    const existed = getSellers()
    existed[seller.id] = seller
    localStorage.setItem('sellers', JSON.stringify(existed));
    updateTitleDiv()
}

function addSellers(sellers) {
    const existed = getSellers()
    sellers.forEach(s => {
        if (s) existed[s.id] = s
    })
    localStorage.setItem('sellers', JSON.stringify(existed));
    updateTitleDiv()
}

function getSellers() {
    try {
        return JSON.parse(localStorage.getItem('sellers'))
    } catch (e) {
    }
    localStorage.setItem('sellers', JSON.stringify({}))
    return {};
}

//================================================================


async function getPageContent(url, dataKey) {
    let retry = 3;
    while (true) {
        console.log(`Request data ${dataKey} on url: ${url}`)
        const newTab = GM_openInTab(url, { active: false, insert: true, setParent: true });
        let timeout, listenerId;
        try {
            return await Promise.race([
                new Promise((r, rj) => {
                    listenerId = GM_addValueChangeListener(dataKey, function(name, oldValue, newValue, remote) {
                        console.log(`Received ${dataKey} ${newValue ? 'some data' : 'no data'}`)
                        GM_removeValueChangeListener(listenerId);
                        listenerId = undefined;
                        GM_setValue(dataKey, null); // Reset the value to avoid duplicate triggers
                        newValue ? r(newValue) : rj(new Error(`Failed get page content ${dataKey} on url: ${url}`));
                    });
                }),
                new Promise((_, rj) => {
                    timeout = setTimeout(() => rj(new Error(`Timeout scrape page: ${url}`)), 30_000)
                })
            ])
        } catch (e) {
            incErrorCnt()
            console.log(`Request data ${dataKey} on url: ${url} Error ${e?.toString()}`)
            if (--retry === 0) break;
            await wait((3 - retry) * SEARCH_DATA?.delay * 1000)
        } finally {
            if (newTab && !newTab.closed && newTab.close) {
                newTab.close()
            }
            if (listenerId) {
                GM_removeValueChangeListener(listenerId);
                listenerId = undefined;
            }
            if (timeout) {
                clearTimeout(timeout);
                timeout = undefined;
            }
        }
    }
    return '';
}

function waitForElementToDisappear(selector) {
    return new Promise((resolve) => {
        const element = document.querySelector(selector);
        if (!element) {
            resolve();
            return;
        }

        const observer = new MutationObserver((mutationsList, observer) => {
            if (!document.contains(element)) {
                observer.disconnect();
                resolve();
            }
        });

        observer.observe(document.body, {
            childList: true, // Observe direct children
            subtree: true, // Observe all descendants
        });
    });
}

function waitForElementToAppear(selector) {
    return new Promise(resolve => {
        function checkForElement() {
            const element = document.querySelector(selector);
            element ? resolve() : setTimeout(checkForElement, 500);
        }
        checkForElement()
    });
}

async function scrapeProductPage(productId) {
    const result = {
        productId: productId,
        sellers: []
    }

    const btns = document.querySelectorAll('button.pdp-info-card--seller');
    for (const btn of btns) {
        await btn.click();
        await waitForElementToAppear('#el-sellerInfoLegalDataImprintAccordion')
        await wait(1000);
        await document.querySelector('#el-sellerInfoLegalDataImprintAccordion').click()

        await waitForElementToAppear('.rd-seller-info__name')
        await wait(1000);
        const sellerName = document.querySelector('div.rd-seller-info__name').innerText;
        const imprintText = document.querySelector('#co-sellerInfoLegalDataImprintAccordion').innerText;

        const regexName = /Name\s+des\s+Diensteanbieters:\s*(.*)\s/ig;
        const representativeName1 = (regexName.exec(imprintText) ?? [])[1];

        const regexName2 = /Vertretungsberechtigte:\s*(.*)\s/ig;
        const representativeName2 = (regexName.exec(imprintText) ?? [])[1];

        const regexName3 = /vertreten\s+durch:\s*(.*)\s/ig;
        const representativeName3 = (regexName.exec(imprintText) ?? [])[1];

        const seller = {
            sellerId: '',
            sellerName: sellerName ?? '',
            representativeName: representativeName1 ?? '',
            representativeName2: representativeName2 ?? '',
            representativeName3: representativeName3 ?? '',
            foundAt: new Date().toISOString(),
            emails: extractEmailsFromSellerText(imprintText),
            imprint: imprintText
        }
        result.sellers.push(seller);
        await waitForElementToAppear('button.rd-overlay__button')
        await document.querySelector('button.rd-overlay__button').click();
    }

    return result;
}

async function waitCaptchaResolve() {
    const captcha = document.querySelector('.captcha-box');
    if (captcha) {
        window.focus();
        await waitForElementToDisappear('.captcha-box')
    }
}

async function mainHandler() {
    await waitCaptchaResolve();

    if (window.location.href.startsWith('https://www.kaufland.de/product/')) {
        const url = window.location.href;
        const parts = url.split('/')
        if (parts.length < 5) {
            window.close();
            return;
        }
        const productId = parts[4];
        const dataKey = `Product_${productId}`
        GM_setValue(dataKey, await scrapeProductPage(productId));
        window.close(); // Close tab after scraping
        return
    }

    //const test = await scrapeProductData(477359320)
    //console.log(test);
    //return;

    if (!SEARCH_DATA?.delay) {
        setSearchData({delay: 30})
    }

    try {
        console.dir('Main handler:', SEARCH_DATA)
        await waitForState();
        if (
            window.location.href === MAIN_PAGE_URL
            && (!SEARCH_DATA?.step || SEARCH_DATA.step === Step.SEARCHING)
        ) {
            setSearchData({step: undefined})
        };

        updateTitleDiv()
        if (!SEARCH_DATA?.step) {
            stopBlinkingTitle()
            if (window.location.href === MAIN_PAGE_URL) {
                await wait(1000);
                showStartForm({
                    version: MAIN_SCRIPT_VERSION
                });
            }
            return;
        }
        if (await handleHomePage()) return;
        if (await handleSearchPage()) return;
    } catch (e) {
        console.error(e)
        endWithError(e.toString())
    }
}

async function handleHomePage() {
    if (window.location.href !== MAIN_PAGE_URL) return false;

    if (SEARCH_DATA.step === 'CATEGORY_SEARCH') {
        const categoryUrl = SEARCH_DATA.keyword
        window.location.href = categoryUrl;
        await wait(1000)
        return true
    }

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

async function hasSubCategoryUrls() {
    return !!document.querySelector('div#hub-category-filters');
}

async function scrapeAllSubCategoryUrls() {
    const items = Array.from(document.querySelectorAll('div#hub-category-filters a'));
    const result = [];

    for (const item of items) {
        result.push(item.getAttribute('href'))
    }
    console.log(`Found ${JSON.stringify(result?.length)} subcategories`);
    return result;
}

async function handleSearchPage() {
    async function currentPage() {
        await waitForState();
        const item = document.querySelector('span.rd-page--current');
        return item ? parseInt(item.innerText) : 1;
    }

    async function waitSearchPageLoaded() {
        await waitForState();
        await waitForElement('div.results article.product')
        const spans = Array.from(document.querySelectorAll('div.results article.product > span'));
        if (spans.length) triggerMouseEnter(spans[0]); // additional trigger to load anchors
        await waitForElement('div.results article.product a.product-link')
        await scrollToBottom()
    }

    async function waitCategoryPageLoaded() {
        await waitForState();
        await scrollToBottom()
    }

    async function inputPrices() {
        const inputs = await waitForElements('div.range-filter__input input')
        let needClick = false;
        if (SEARCH_DATA.minPrice) {
            inputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            await typeText(inputs[0], SEARCH_DATA.minPrice.toString())
            await wait(300)
            needClick = true;
        }
        if (SEARCH_DATA.maxPrice) {
            inputs[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
            await typeText(inputs[1], SEARCH_DATA.maxPrice.toString())
            await wait(300)
            needClick = true;
        }

        // TODO: input price values do not cause change event on 'div.app-organic-search__left-body'
        // On that event value of link is modified in anchor 'div.filter-price-group a.price-ok'
        // which is clicked to apply prices. For now I just manually modify href of the link

        setSearchData({step: Step.SEARCHING})
        if (needClick) {
            document.querySelector('div.filter--range span.range-filter__link').click();
            setTimeout(mainHandler, 0);
            return true;
        }
        return false;
    }

    async function handleSearchPages() {
        await waitSearchPageLoaded()

        if (SEARCH_DATA.step === Step.INPUT_PRICE) {
            if (await inputPrices()) return true;
        }

        await wait(3000);
        await scrapeAllSellersOnPage();

        const pageIndex = await currentPage();
        if (pageIndex === 1 && SEARCH_DATA.startPage > 1) {
            window.location.href = window.location.href + '&page=' + SEARCH_DATA.startPage;
            await wait(1000)
            return true
        }

        if (pageIndex >= SEARCH_DATA.maxPages + SEARCH_DATA.startPage - 1) {
            downloadCsv(getSellers())
            endWithSuccess('Done: all pages are searched')
            return true
        }

        const btn = document.querySelector('nav button.rd-page--button span.svg-icon--rotate90');
        if (!btn) {
            downloadCsv(getSellers())
            endWithSuccess('Done: no more pages')
            return true;
        }

        btn.click()
        setTimeout(mainHandler, 0);
        return true;
    }

    async function handleCategoryPages() {
        await waitCategoryPageLoaded()
        await wait(1000);
        if (
            !document.querySelector('div.result-header') // no result and have sub categories
            && await hasSubCategoryUrls()
        ) {

            const subCategoryUrls = await scrapeAllSubCategoryUrls()
            subCategoryUrls.forEach(one => addCategoryUrl(one));
            const nextCategoryUrl = await popNextCategoryUrl();
            if (!nextCategoryUrl) {
                downloadCsv(getSellers())
                endWithSuccess('Done: all categories are searched. #1')
                return true
            }

            window.location.href = nextCategoryUrl;
            await wait(1000)
            return true
        } else {

            await scrapeAllSellersOnPage();
            const pageIndex = await currentPage();
            if (pageIndex === 1 && SEARCH_DATA.startPage > 1) {
                window.location.href = window.location.href + '&page=' + SEARCH_DATA.startPage;
                await wait(1000)
                return true
            }

            if (pageIndex >= SEARCH_DATA.maxPages + SEARCH_DATA.startPage - 1) {
                const nextCategoryUrl = await popNextCategoryUrl();
                if (!nextCategoryUrl) {
                    downloadCsv(getSellers())
                    endWithSuccess('Done: all categories are searched. #2')
                    return true
                }
                window.location.href = nextCategoryUrl;
                await wait(1000)
                return true
            }

            const btn = document.querySelector('nav button.rd-page--button span.svg-icon--rotate90');
            if (!btn) {
                const nextCategoryUrl = await popNextCategoryUrl();
                if (!nextCategoryUrl) {
                    downloadCsv(getSellers())
                    endWithSuccess('Done: all categories are searched. #3')
                    return true
                }
                window.location.href = nextCategoryUrl;
                await wait(1000)
                return true
            }

            btn.click()
            setTimeout(mainHandler, 0);
            return true;
        }

        return;
    }

    if (window.location.href.includes('/c/')) {
        return await handleCategoryPages();
    }
    if (window.location.href.includes('/s/')) {
        return await handleSearchPages();
    }
    return false;

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
            console.log(`Reload page: ${window.location.href}`);
            window.location.reload();
            await wait(4000)
            await waitForState();
            data = unsafeWindow.__SEARCHFRONTEND__;
        }
        return data;
    }

    async function getProductElements() {
        let productElements = document.querySelectorAll('div.results article.product')
        while (!productElements.length) {
            console.log(`Reload page: ${window.location.href}`);
            window.location.reload();
            await wait(4000)
            await waitForState();
            productElements = document.querySelectorAll('div.results article.product')
        }
        return productElements;
    }

    //withLinks ? 'div.results article.product a.product-link' : 'div.results article.product'
    const data = await getData();
    const productElements = await getProductElements();
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

function showStartForm(formData) {
    // Create a div to contain the form
    const overlapContainer = document.createElement('div');
    overlapContainer.id = 'overlap-container'

    const formContainer = document.createElement('div');
    formContainer.id = 'dark-form-container'

    GM_addStyle(`
       a:link {
            color: blue;
            background-color: transparent;
            text-decoration: underline;
       }

       #overlap-container {
            position: fixed;
            top: 0;
            left: 0;
            background-color: rgba(105, 105, 105, 0.7);
            padding: 20px;
            border-radius: 10px;
            width: 100%;
            height: 100%;
            z-index: 5000;
        }
        #dark-form-container {
            position: absolute;
            top: 5%;
            left: 40%;
            background-color: #333;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
            color: #fff;
            max-width: 300px;
            width: 100%;
            z-index: 5001;
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
                <label for="keyword">Keyword:</label><br/>
                <input type="text" id="keyword" name="keyword" value="iphone 15 pro max"><br/><br/>
                <label for="maxPages">Max pages</label><br/>
                <input type="text" id="maxPages" name="maxPages" value="10"><br/><br/>
                <label for="startPage">Start page</label><br/>
                <input type="text" id="startPage" name="startPage" value="1"><br/><br/>
                <label for="delay">Delay on too many requests, secs</label><br/>
                <input type="text" id="delay" name="delay" value="30"><br/><br/>
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
    document.body.appendChild(overlapContainer);

    const sellers = getSellers();
    const sellersCnt = Object.keys(sellers)?.length;
    if (sellersCnt) {
        formContainer.appendChild(document.createElement('br'))
        const sellersDownloadLink = createLinkWithCsv(sellers);
        sellersDownloadLink.innerHTML = `Download previous sellers ${sellersCnt}`;
        formContainer.appendChild(sellersDownloadLink)

        formContainer.appendChild(document.createElement('br'))
        const resetLink = document.createElement('a');
        resetLink.setAttribute('id', 'resetLink-link');
        resetLink.setAttribute('href', '/');
        resetLink.innerHTML = `Remove previous sellers`;
        resetLink.addEventListener('click', event => {
            event.stopImmediatePropagation();
            resetSellers();
            resetCategoryUrls();
        });
        formContainer.appendChild(resetLink)
    }

    // Handle form submission
    document.getElementById('inputForm').addEventListener('submit', function(event) {
        event.preventDefault();
        resetSellers();
        resetCategoryUrls();
        setSearchData({
            delay: extractInt(document.getElementById('delay').value ?? '30'),
            maxPages: extractInt(document.getElementById('maxPages').value),
            minPrice: extractInt(document.getElementById('minPrice').value),
            maxPrice: extractInt(document.getElementById('maxPrice').value),
            startPage: extractInt(document.getElementById('startPage').value),
            keyword: document.getElementById('keyword').value,
            step: document.getElementById('keyword').value.startsWith('http') ? 'CATEGORY_SEARCH' : Step.INPUT_PRICE,
            errorsCnt: 0
        })
        // console.log('Search data:', SEARCH_DATA);
        // Remove the form after submission
        document.body.removeChild(formContainer);
        document.body.removeChild(overlapContainer);
        mainHandler()
    });

    // Handle form cancellation
    document.getElementById('cancelButton').addEventListener('click', function() {
        document.body.removeChild(formContainer);
        document.body.removeChild(overlapContainer);
    });

    formContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function extractUniqueSellerIds(content) {
    const regex = /(?:id_seller|sellerId)=(\d+)/g;
    const ids = new Set();  // Use a Set to store unique IDs
    let match;
    while ((match = regex.exec(content)) !== null) {
        ids.add(match[1]);
    }
    const result = Array.from(ids);
    console.log('Unique IDs:', result);
    if (!result.length) {
        console.log(content)
    }
    return result
}

async function scrapeProductData(productId) {
    console.log(`Request product: ${productId}`)
    const urlToScrape = `https://www.kaufland.de/product/${productId}/`;
    const dataKey = `Product_${productId}`;
    return await getPageContent(urlToScrape, dataKey)
}

//E-Mail-Adresse: ​qinfo@akowi.com
function extractEmailsFromSellerText(content) {
    //E-Mail-Adresse:\s*
    const regex = /E-Mail-Adresse:\s*(.*)\s/g;
    const emails = new Set();
    let match;
    while (match = regex.exec(content)) {
        emails.add(match[1]);
    }

    const result = Array.from(emails);
    console.log('Seller Emails:', result);
    return result
}

async function scrapeAllSellersOnPage() {
    const products = await getProductsOnPage()
    const leftProducts = [...products];
    while (leftProducts.length) {
        const promises = []
        let cnt = Math.min(7, leftProducts.length);
        while (cnt-- > 0) {
            const product = leftProducts.shift();
            await wait(1000);
            promises.push((async () => {
                const productData = await scrapeProductData(product.id)
                if (Array.isArray(productData?.sellers)) {
                    productData?.sellers.forEach(seller => addSeller(seller))
                    console.log(`Done for ${product.id}. Sellers: ${Object.keys(getSellers())?.length}`)
                } else {
                    console.log(`Bad data from product page ${JSON.stringify(productData)}`)
                }
            })())
        }
        await Promise.all(promises)
        await wait(3000);
    }
}


function downloadCsv(sellers) {
    if (sellers.length === 0) {
        alert('No sellers found.');
        return;
    }

    const link = createLinkWithCsv(sellers)
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function escapeCSVField(value) {
    if (typeof value !== 'string') {
        value = String(value);
    }

    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
        value = value.replace(/"/g, '""');
        value = `"${value}"`;
    }
    return value;
}

function createLinkWithCsv(sellers) {
    if (sellers.length === 0) return null;
    /*
        const seller = {
            sellerId: '',
            sellerName: sellerName,
            representativeName: representativeName1,
            representativeName2: representativeName2,
            representativeName3: representativeName3,
            foundAt: new Date().toISOString(),
            emails: extractEmailsFromSellerText(imprintText),
            imprint: imprintText
        }
    */
    const csvContent =
        'Found,SellerId,SellerName,Email,Representative1,Representative2,Representative3,imprint\n'
        + Object.values(sellers).map(
            s => `"${s.foundAt}","${s.sellerId}","${s.sellerName}","${s.emails[0] ?? 'not found'}","${s.representativeName1}","${s.representativeName2}","${s.representativeName3}",${escapeCSVField(s.imprint)}`
        ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('id', 'download-link');
    link.setAttribute('href', url);
    link.setAttribute('download', 'sellers.csv');
    return link
}

function createInfoTitle(text = 'AUTOMATION RUNNING...') {
    // Create a div to contain the title
    const titleDiv = document.createElement('div');
    titleDiv.textContent = text;
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
    return titleDiv
}