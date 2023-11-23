
const searchButton = document.querySelector("#search_button")
const searchInput = document.querySelector("#search_input")


// feat: whenever user start typing, focus input and do search
let searchDelayTimeoutId = null;
function doSearchAfterDelay() {
    if (searchDelayTimeoutId) {
        clearTimeout(searchDelayTimeoutId)
    }
    searchDelayTimeoutId = setTimeout(() => {
        searchButton.click()
    }, 100);
}

document.addEventListener("keypress", (e) => {
    const isEnterKey = e.code === "Enter"
    if (isEnterKey) {
        searchButton.click();
        return;
    }

    const isInput = () => {
        return document.activeElement.nodeName === "INPUT"
    }

    if (document.activeElement != searchInput && !isInput()) {
        // type anywhere to focus on search input and start typing in it
        e.preventDefault()
        searchInput.focus()
        searchInput.value += e.key
        doSearchAfterDelay();  // we are changing input directly, wouldnt fire event, so trigger it manually
    }
})
searchInput.addEventListener("input", (e) => {
    doSearchAfterDelay()
})

// feat: allow user to change max search depth
async function getMaxDepth() {

    // get from user input
    const maxDepthInput = document.querySelector("#depth_input")
    let maxDepth = getAsNumber(maxDepthInput.value)
    if (isNaN(maxDepth)) {
        // get from storage
        const settings = await getSettings()
        if (settings.max_depth) {
            maxDepth = getAsNumber(settings.max_depth)
        }
    }
    // fallback
    if (isNaN(maxDepth)) {
        maxDepth = 4
    }
    maxDepthInput.value = maxDepth

    // save to settings
    const settings = await getSettings()
    settings.max_depth = maxDepth
    await saveSettings(settings)

    return maxDepth
}

// feat: search through local storage
searchButton.onclick = async function () {
    searchButton.disabled = true
    document.body.classList.add("loading")
    searchButton.classList.add("loading")

    const searchText = searchInput.value
    const parsed = parseRecursive(await getLocalStorageContent(), await getMaxDepth())
    const trimmed = trimNotContainInPlace(parsed, searchText)
    await refresh(trimmed)

    searchButton.classList.remove("loading")
    document.body.classList.remove("loading")
    searchButton.disabled = false
}

function trimNotContainInPlace(node, text) {
    if (text === "") {
        return node
    }
    if (!node) {
        return null;
    }
    if (node.is_leaf) {
        if (node.clipboard_value && node.clipboard_value.toLowerCase().includes(text.toLowerCase())) {
            return node
        } else {
            return null
        }
    } else {
        // have children
        const trimmedChildren = {}
        for (const [k, v] of Object.entries(node.children)) {
            let trimmedChild = null;
            if (k.toLowerCase().includes(text.toLowerCase())) {
                trimmedChild = v // if key contains search text, keep all its children
            } else {
                trimmedChild = trimNotContainInPlace(v, text)  // else search in its children
            }
            if (trimmedChild !== null) {
                trimmedChildren[k] = trimmedChild
            }
        }
        if (Object.keys(trimmedChildren).length > 0) {
            // any of the children contains the text
            node.children = trimmedChildren
            return node
        } else {
            return null;
        }
    }
}

// feat: refresh
const refreshButton = document.querySelector("#refresh_button")
refreshButton.onclick = async function () {
    refreshButton.disabled = true
    refreshButton.classList.add("loading")
    await refresh()
    refreshButton.classList.remove("loading")
    refreshButton.disabled = false
}

// utilities
export function isObject(obj) {
    return obj && typeof obj === 'object' && !Array.isArray(obj)
}

export function isArray(obj) {
    return obj && Array.isArray(obj)
}

export function isString(obj) {
    return typeof obj === 'string' || typeof obj === 'String'
}

export function getAsNumber(anything) {
    if (!isString(anything)) {
        anything = String(anything)
    }
    return parseInt(anything, 10)
}

async function getSettings() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const origin = new URL(tab.url).origin
    const settings = await chrome.storage.sync.get(origin)
    // console.log(`getting settings:`, settings[origin])
    return (settings && settings[origin]) ? settings[origin] : {}
}

async function saveSettings(settings) {
    // console.log(`saving settings:`, settings)
    if (!settings) {
        settings = {}
    }
    if (!isObject(settings)) {
        throw new Error(`trying to save a non-object settings: ${settings}`)
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const origin = new URL(tab.url).origin
    const toSave = {}
    toSave[origin] = settings
    await chrome.storage.sync.set(toSave)
}

// feat: on open extension popup, get local storage content and create tree
async function refresh(parsedNode) {

    const maxDepth = await getMaxDepth()

    if (parsedNode === null || parsedNode === undefined) {
        parsedNode = parseRecursive({
            "ROOT": await getLocalStorageContent()
        }, maxDepth)
    }

    deleteHtmlContainerIn(document.body)

    const lastUpdated = new Date()

    insertStats(parsedNode, lastUpdated)

    const inserted = insertHtmlRecursive(parsedNode, document.body, maxDepth)

    if (inserted === null) {
        document.querySelector("#empty_label").classList.remove("display_none")
    } else {
        document.querySelector("#empty_label").classList.add("display_none")
    }
}

async function getLocalStorageContent() {
    // const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // const response = await chrome.tabs.sendMessage(tab.id, { type: "retrieve" });
    // return response

    // Get the current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const execution = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ ...localStorage }),
    })
    return execution[0].result
}

function parseRecursive(raw, depth) {

    let is_object = false
    let is_object_tag = false  // node maybe an object but not a object tag, because leaf node (max depth reached) always display full content, even if it is an object 
    let is_array = false
    let is_array_tag = false   // similar to above
    let is_string_tag = false
    let clipboard_value;
    let display_value;
    let js_value;


    if (isObject(raw)) {
        js_value = raw
        clipboard_value = JSON.stringify(raw)
        display_value = "type object"
        is_object = true
        is_object_tag = true
    } else if (isArray(raw)) {
        js_value = raw
        clipboard_value = JSON.stringify(raw)
        display_value = "type array"
        is_array = true
        is_array_tag = true
    } else if (isString(raw)) {
        try {
            // handle json string
            js_value = JSON.parse(raw)
            clipboard_value = String(raw)
            display_value = "type string"
            is_string_tag = true
            if (isObject(js_value)) {
                is_object = true
            } else if (isArray(js_value)) {
                is_array = true
            } else {
                // it can be value like: true / false / 1 / null, fk JSON.parse
                // see also: https://stackoverflow.com/a/33369954/6880256
                display_value = raw
            }
        } catch (err) {
            // handle normal string
            display_value = String(raw)
            clipboard_value = String(raw)
            js_value = raw
        }
    } else {
        display_value = String(raw)
        clipboard_value = String(raw)
        js_value = raw
    }

    // set typical value

    const node = {
        js_value: js_value,  // string / object / array
        display_value: display_value,  // string / "object"  / "array"
        clipboard_value: clipboard_value,  // string
        is_leaf: true,
        is_object: is_object,
        is_object_tag: is_object_tag,
        is_array: is_array,
        is_array_tag: is_array_tag,
        is_string_tag: is_string_tag,
        children: {},  // key map to node
    }

    // set is_leaf
    if (depth > 0) {
        if (node.is_object) {
            node.is_leaf = false
            for (const [k, v] of Object.entries(node.js_value)) {
                node.children[k] = parseRecursive(v, depth - 1)
            }
        } else if (node.is_array) {
            node.is_leaf = false
            node.js_value.forEach((value, i) => {
                node.children[i] = parseRecursive(value, depth - 1)
            })
        }
    }

    // for leaf node, always display content, not its type information
    if (node.is_leaf) {
        node.display_value = node.clipboard_value
        node.is_array_tag = false
        node.is_object_tag = false
        node.is_string_tag = false
    }

    return node;
}

// UI relate functions

function insertStats(node, lastUpdated) {
    const statsNode = document.querySelector("#stats")
    if (statsNode) {
        statsNode.innerHTML = `<b>Time</b> ${lastUpdated}<br/>`
    }
}

function insertHtmlRecursive(node, parent, depth) {
    if (depth <= 0) {
        return null;
    }
    if (node === null || node === undefined) {
        return null;
    }
    if (Object.keys(node.children).length > 0) {
        const container = createHtmlContainerIn(parent)
        parent.classList.add("nonleaf_li")
        for (const [key, child] of Object.entries(node.children)) {
            const htmlNode = createHtmlNode(key, child)
            container.insertAdjacentElement('beforeend', htmlNode)
            insertHtmlRecursive(child, htmlNode, depth - 1)
        }
        return container
    }
    return null
}

function createHtmlNode(key, node) {

    // clone template and create a html element from given parsed node

    const li_template = document.getElementById("li_template");
    const nodeContainer = li_template.content.firstElementChild.cloneNode(true);

    const copyFunction = async () => {
        await navigator.clipboard.writeText(node.clipboard_value)
            .then(() => {
                nodeContainer.querySelector(".copied").classList.remove("display_none")
                setTimeout(() => {
                    nodeContainer.querySelector(".copied").classList.add("display_none")
                }, 1000)
            })
    }

    const visibilityElement = nodeContainer.querySelector(".visibility");
    visibilityElement.onclick = async () => {
        nodeContainer && nodeContainer.classList.toggle("hide_children")
    }

    const keyElement = nodeContainer.querySelector(".key");
    keyElement.textContent = key
    keyElement.onclick = async () => {
        nodeContainer && nodeContainer.classList.toggle("hide_children")
    }

    const valueElement = nodeContainer.querySelector(".value")
    valueElement.textContent = node.display_value
    // valueElement.onclick = copyFunction

    const childrenCountElement = nodeContainer.querySelector(".count_tag")
    childrenCountElement.textContent = `size ${Object.keys(node.children).length}`

    const copyIconElement = nodeContainer.querySelector(".copy_icon")
    copyIconElement.onclick = copyFunction

    // TODO: bookmark feature
    // const bookmarkIconElement = nodeContainer.querySelector(".bookmark_icon")
    // bookmarkIconElement.onclick = async function () {
    //     bookmarkIconElement.classList.toggle("filled_bookmark_icon")
    //     // const settings = await getSettings()
    // }

    const eyeIconElement = nodeContainer.querySelector(".eye_icon")
    eyeIconElement.onclick = function () {
        eyeIconElement.classList.toggle("filled_eye_icon")
        keyElement.classList.toggle("trim")
        valueElement.classList.toggle("trim")
    }

    if (node.is_object_tag) {
        valueElement.classList.add("object_tag")
    } else if (node.is_array_tag) {
        valueElement.classList.add("array_tag")
    } else if (node.is_string_tag) {
        valueElement.classList.add("string_tag")
    }

    return nodeContainer;
}

function createHtmlContainerIn(parentElement) {
    const ul = document.createElement('ul')
    ul.classList.add("kv_ul")
    parentElement.insertAdjacentElement('beforeend', ul)
    return ul
}

function deleteHtmlContainerIn(parentElement) {
    const ul = parentElement && parentElement.querySelector("ul")
    ul && ul.remove()
}

await refresh()