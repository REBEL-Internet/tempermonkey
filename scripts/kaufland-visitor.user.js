// ==UserScript==
// @name         Kaufland visitor
// @namespace    kaufland
// @version      2024.06.07
// @description
// @author       Dmitry.Pismennyy<dmitry.p@rebelinterner.eu>
// @match        https://www.kaufland.de/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kaufland.de
// @require      http://localhost:8000/utils.js
// @require      https://github.com/REBEL-Internet/tempermonkey/raw/main/scripts/releases/1.0.0/utils.js
// @grant        GM_addStyle
// ==/UserScript==

const MAIN_PAGE_URL = 'https://www.kaufland.de/';

(async function() {
    'use strict';
    window.addEventListener('load', mainHandler);
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
            if (window.location.href === MAIN_PAGE_URL) {
                await wait(1000);
                showStartVisitorForm();
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
            return true;
        }
        return false;
    }

    //https://www.kaufland.de/s/?page=6&search_value=t-shirt

    if (!window.location.href.includes('/s/')) return false;
    await waitSearchPageLoaded()

    if (SEARCH_DATA.step === Step.INPUT_PRICE) {
        if (await inputPrices()) return true;
    }

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

    if (pageIndex === 1 && SEARCH_DATA.startPage > 1) {
        window.location.href = window.location.href + '&page=' + SEARCH_DATA.startPage;
        await wait(1000)
        return true
    }

    if (pageIndex >= SEARCH_DATA.maxPages + SEARCH_DATA.startPage - 1) {
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