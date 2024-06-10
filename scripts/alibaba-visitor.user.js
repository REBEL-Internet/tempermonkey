// ==UserScript==
// @name         Alibaba visitor
// @namespace    alibaba
// @version      2024.06.10.003
// @description  Alibaba visitor
// @author       Dmitry.Pismennyy<dmitry.p@rebelinterner.eu>
// @match        https://www.alibaba.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=alibaba.com
// @require      http://localhost:8000/utils.js
// @require      https://raw.githubusercontent.com/REBEL-Internet/tempermonkey/main/releases/1.0.2/utils.js
// @grant        GM_addStyle
// ==/UserScript==

const MAIN_SCRIPT_VERSION = '2024.06.10.003'
const MAIN_PAGE_URL = 'https://www.alibaba.com/';

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
            window.location.href === MAIN_PAGE_URL
            && (!SEARCH_DATA?.step || SEARCH_DATA.step === Step.SEARCHING)
        ) {
            setSearchData({step: undefined})
        };
        if (!SEARCH_DATA?.step) {
            stopBlinkingTitle()
            if (window.location.href === 'https://www.alibaba.com/') {
                await wait(1000);
                showStartVisitorForm({
                    version: MAIN_SCRIPT_VERSION
                });
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
    if (window.location.href !== MAIN_PAGE_URL) return false;
    const textSearch = SEARCH_DATA.keyword;
    if (!textSearch) return true;

    await wait(300)
    const input = await waitForElement('input.search-bar-input')
    await typeText(input, textSearch)
    await wait(300)
    document.querySelector('div[class*="header-search-bar"] button').click();
    return true;
}

async function handleSearchPage() {
    async function currentPage() {
        const item = document.querySelector('div.seb-pagination__pages span.active');
        if (!item) return 1;
        return parseInt(item.innerText)
    }

    async function waitSearchPageLoaded() {
        await waitForState();
        await waitForElement('div.app-organic-search__main-body div.organic-list')
        await scrollToBottom()
        await wait(1000);
        window.scrollBy(0, 50); // additional fix for slow proxy to make pagination appears
        try {
            await waitForElement('div.seb-pagination__pages')
        } catch (e) {
            console.log(e)
        }
    }

    async function inputPrices() {
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
        return false;
    }

    if (!window.location.href.includes('/search')) return false;
    await waitSearchPageLoaded()

    if (SEARCH_DATA.step === Step.INPUT_PRICE) {
        if (await inputPrices()) return true;
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

    if (pageIndex === 1 && SEARCH_DATA.startPage > 1) {
        window.location.href = window.location.href + '&page=' + SEARCH_DATA.startPage;
        await wait(1000)
        return true
    }

    if (pageIndex >= SEARCH_DATA.maxPages + SEARCH_DATA.startPage - 1) {
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