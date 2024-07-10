// ==UserScript==
// @name         Kaufland Email Scrapper
// @namespace    kaufland
// @version      2024.07.10.001
// @description
// @author       Dmitry.Pismennyy<dmitry.p@rebelinterner.eu>
// @match        https://www.kaufland.de/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kaufland.de
// @require      http://localhost:8000/utils.js
// @require      https://raw.githubusercontent.com/REBEL-Internet/tempermonkey/main/releases/1.0.2/utils.js
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_deleteValue
// ==/UserScript==

const MAIN_SCRIPT_VERSION = '2024.06.10.001'
const MAIN_PAGE_URL = 'https://www.kaufland.de/';

(async function() {
    'use strict';
    window.addEventListener('load', mainHandler);
})();


if (!localStorage.getItem('sellers')) {
    localStorage.setItem('sellers', JSON.stringify({}))
}

let titleDiv;

function addSeller(seller) {
    const existed = getSellers()
    existed[seller.id] = seller
    localStorage.setItem('sellers', JSON.stringify(existed));
    if (titleDiv) {
        titleDiv.textContent = `RUNNING. FOUND ${Object.keys(existed)?.length} Error: ${SEARCH_DATA?.errorsCnt ?? 0}`
    }
}

function addSellers(sellers) {
    const existed = getSellers()
    sellers.forEach(s => {
        if (s) existed[s.id] = s
    })
    localStorage.setItem('sellers', JSON.stringify(existed));
    if (titleDiv) {
        titleDiv.textContent = `RUNNING. FOUND ${Object.keys(existed)?.length} Error: ${SEARCH_DATA?.errorsCnt ?? 0}`
    }
}

function getSellers() {
    try {
        return JSON.parse(localStorage.getItem('sellers'))
    } catch (e) {
    }
    localStorage.setItem('sellers', JSON.stringify({}))
    return {};
}

async function mainHandler() {
    //await scrapeAllSellersOnPage()
    //return
    //const info = await scrapeSellerData(29717500)
    //alert(JSON.stringify(info))
    //const sellerIds = await scrapeSellerIdsByProductId(382679048)
    //alert(sellerIds)
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

        if (!SEARCH_DATA?.step) {
            stopBlinkingTitle()
            if (window.location.href === MAIN_PAGE_URL) {
                await wait(1000);
                showStartForm({
                    version: MAIN_SCRIPT_VERSION
                });
            }
            return;
        } else {
            titleDiv = createInfoTitle(`RUNNING. FOUND ${Object.keys(getSellers())?.length} Error: ${SEARCH_DATA?.errorsCnt ?? 0}`)
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
        await waitForElement('div.results article.product')
        const spans = Array.from(document.querySelectorAll('div.results article.product > span'));
        if (spans.length) triggerMouseEnter(spans[0]); // additional trigger to load anchors
        await waitForElement('div.results article.product a.product-link')
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

    if (!window.location.href.includes('/s/')) return false;
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
            localStorage.setItem('sellers', JSON.stringify({}))
        });
        formContainer.appendChild(resetLink)
    }

    // Handle form submission
    document.getElementById('inputForm').addEventListener('submit', function(event) {
        event.preventDefault();
        setSearchData({
            delay: extractInt(document.getElementById('delay').value ?? '30'),
            maxPages: extractInt(document.getElementById('maxPages').value),
            minPrice: extractInt(document.getElementById('minPrice').value),
            maxPrice: extractInt(document.getElementById('maxPrice').value),
            startPage: extractInt(document.getElementById('startPage').value),
            keyword: document.getElementById('keyword').value,
            step: Step.INPUT_PRICE,
            errorsCnt: 0
        })
        //console.log('Search data:', SEARCH_DATA);
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
    const regex = /id_seller=(\d+)&/g;
    const ids = new Set();  // Use a Set to store unique IDs
    let match;

    while ((match = regex.exec(content)) !== null) {
        ids.add(match[1]);
    }

    const result = Array.from(ids);
    console.log('Unique IDs:', result);
    return result
}

async function scrapeSellerIdsByProductId(productId) {
    let response;
    let retry = 3;
    while (true) {
        console.log(`Request product: ${productId}`)
        response = await GM.xmlHttpRequest({
            method: 'GET',
            url: `https://www.kaufland.de/product/${productId}/`
        });

        console.log(`Response product: ${productId}: ${response.status}`)
        if (response.status !== 429) break;
        setSearchData({errorsCnt: SEARCH_DATA.errorsCnt + 1})
        if (--retry === 0) break;
        await wait((3-retry) * SEARCH_DATA?.delay * 1000)
    }
    const content = response.responseText;
    if (response.status === 200 && content) {
        return extractUniqueSellerIds(content)
    }
    setSearchData({errorsCnt: SEARCH_DATA.errorsCnt + 1})
    return [];
}

//E-Mail-Adresse: ​qinfo@akowi.com
function extractEmailsFromSellerText(content) {
    //E-Mail-Adresse:\s*
    const regex = /E-Mail-Adresse:\s*(.*)\</g;
    const emails = new Set();
    let match;
    while ((match = regex.exec(content)) !== null) {
        emails.add(match[1]);
    }

    const result = Array.from(emails);
    console.log('Seller Emails:', result);
    return result
}

async function scrapeSellerData(sellerId) {
    let response;
    let retry = 3;
    while (true) {
        console.log(`Request seller: ${sellerId}`)
        response = await GM.xmlHttpRequest({
            method: 'GET',
            url: `https://www.kaufland.de/backend/product-detail-page/v1/${sellerId}/seller-info`,
            responseType: 'json',
        });
        console.log(`Response seller: ${sellerId}: ${response.status}`)
        if (response.status !== 429) break;
        setSearchData({errorsCnt: SEARCH_DATA.errorsCnt + 1})
        if (--retry === 0) break;
        await wait((3-retry) * SEARCH_DATA.delay * 1000)
    }

    if (response.status === 200 && response.response?.sellerInformation) {
        const sellerInfo = response.response.sellerInformation;
        return {
            id: sellerId,
            foundAt: new Date().toISOString(),
            name: sellerInfo.name,
            emails: extractEmailsFromSellerText(sellerInfo.legalData.imprint),
            sellerCountryISO: sellerInfo.sellerCountryISO
        }
    }

    setSearchData({errorsCnt: SEARCH_DATA.errorsCnt + 1})
    return undefined;
}

async function scrapeAllSellersOnPage() {
    const products = await getProductsOnPage()
    const promises = []
    for (const product of products) {
        await wait(3000);
        promises.push((async () => {
            const sellerIds = await scrapeSellerIdsByProductId(product.id)
            if (sellerIds.length && !getSellers()[sellerIds[0]]) {
                const seller = await scrapeSellerData(sellerIds[0])
                if (seller) addSeller(seller)
            }
        })())
    }

    await Promise.all(promises)
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

function createLinkWithCsv(sellers) {
    if (sellers.length === 0) return null;
    const csvContent =
        'Found,SellerId,Name,Email,EmailFixed\n'
        + Object.values(sellers).map(
            s => `"${s.foundAt}","${s.id}","${s.name}","${s.emails[0] ?? 'not found'}","${s.emails[0]?.slice(2) ?? 'not found'}"`
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