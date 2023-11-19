const searchButton = document.querySelector("#search_button")
const searchInput = document.querySelector("#search_input")

let searchDelayTimeoutId = null;
function doSearchAfterDelay() {
    if (searchDelayTimeoutId) {
        clearTimeout(searchDelayTimeoutId)
    }
    searchDelayTimeoutId = setTimeout(() => {
        searchButton.click()
    }, 100);
}

// feat: whenever user start typing, focus input and do search
document.addEventListener("keypress", (e) => {
    const isEnterKey = e.code === "Enter"
    if (isEnterKey) {
        searchButton.click();
        return;
    }
    if (document.activeElement != searchInput) {
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

// feat: search through local storage
searchButton.onclick = function () {
    deleteHtmlContainerIn(document.body)
    const searchText = searchInput.value
    const searchResult = trimNotContain(localStorageContent, searchText)
    const inserted = insertHtmlRecursive(searchResult, document.body, 5)

    if (inserted === null) {
        document.querySelector("#empty_label").classList.remove("display_none")
    } else {
        document.querySelector("#empty_label").classList.add("display_none")
    }
}

const MAX_DEPTH = 5; // max depth to parse the local storage json

// feat: on open extension popup, get local storage content and create tree
const localStorageContent = parseRecursive(await getLocalStorageContent(), MAX_DEPTH)
insertHtmlRecursive(localStorageContent, document.body, MAX_DEPTH)

function insertHtmlRecursive(node, parent, depth) {
    if (depth <= 0) {
        return null;
    }
    if (node === null) {
        return null;
    }

    if (Object.keys(node.children).length > 0) {
        const container = createHtmlContainerIn(parent)
        parent.classList.add("nonleaf_ul")
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

    const visibilityElement = nodeContainer.querySelector(".visibility");
    visibilityElement.onclick = async () => {
        nodeContainer && nodeContainer.classList.toggle("hide_ul_children")
    }

    const keyElement = nodeContainer.querySelector(".key");
    keyElement.textContent = key
    keyElement.onclick = async () => {
        nodeContainer && nodeContainer.classList.toggle("hide_ul_children")
    }

    const valueElement = nodeContainer.querySelector(".value")
    valueElement.textContent = node.display_value
    valueElement.onclick = async () => {
        await navigator.clipboard.writeText(node.clipboard_value)
            .then(() => {
                nodeContainer.querySelector(".copied").classList.remove("display_none")
                setTimeout(() => {
                    nodeContainer.querySelector(".copied").classList.add("display_none")
                }, 1000)
            })
    }

    if (node.is_object) {
        valueElement.classList.add("object_tag")
    } else if (node.is_array) {
        valueElement.classList.add("array_tag")
    } else {
        valueElement.classList.add("leaf_tag")
    }

    return nodeContainer;
}

function createHtmlContainerIn(parentElement) {
    const ul = document.createElement('ul')
    parentElement.insertAdjacentElement('beforeend', ul)
    return ul
}

function deleteHtmlContainerIn(parentElement) {
    const ul = parentElement && parentElement.querySelector("ul")
    ul && ul.remove()
}

async function getLocalStorageContent() {
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
    let is_array = false
    let clipboard_value;
    let display_value;
    let js_value;

    if (isObject(raw)) {
        js_value = raw
        clipboard_value = JSON.stringify(raw)
        display_value = "object"
        is_object = true
    } else if (isArray(raw)) {
        js_value = raw
        clipboard_value = JSON.stringify(raw)
        display_value = "array"
        is_array = true
    } else if (isString(raw)) {
        try {
            // handle json string
            js_value = JSON.parse(raw)
            clipboard_value = String(raw)
            if (isObject(js_value)) {
                display_value = "object"
                is_object = true
            } else if (isArray(js_value)) {
                display_value = "array"
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

    const node = {
        js_value: js_value,  // string / object / array
        display_value: display_value,  // string / "object"  / "array"
        clipboard_value: clipboard_value,  // string
        is_leaf: true,
        is_object: is_object,
        is_array: is_array,
        children: {}  // key map to node
    }

    // console.log(`depth=${depth}, node=`, node)
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

    return node;
}


function trimNotContain(parsedNode, text) {
    if (text === "") {
        return parsedNode
    }
    if (parsedNode === null) {
        return null;
    }
    if (parsedNode.clipboard_value && !parsedNode.clipboard_value.toLowerCase().includes(text.toLowerCase())) {
        return null
    }
    const copy = structuredClone(parsedNode)
    if (!copy.is_leaf) {
        const trimmedChildren = {}
        for (const [k, v] of Object.entries(copy.children)) {
            let trimmedChild = null;
            if (k.toLowerCase().includes(text.toLowerCase())) {
                trimmedChild = v // if key contains search text, keep all children
            } else {
                trimmedChild = trimNotContain(v, text)
            }
            if (trimmedChild !== null) {
                trimmedChildren[k] = trimmedChild
            }
        }
        copy.children = trimmedChildren
    }
    return copy
}

export function isObject(obj) {
    return obj && typeof obj === 'object' && !Array.isArray(obj)
}

export function isArray(obj) {
    return obj && Array.isArray(obj)
}

export function isString(obj) {
    return typeof obj === 'string' || typeof obj === 'String'
}