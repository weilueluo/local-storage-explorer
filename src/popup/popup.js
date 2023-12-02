// fetch("../manifest.json").then(json => json.text()).then(text => {
//     browser.management.getPermissionWarningsByManifest(text, warnings => {
//         console.log("warnings")
//         console.log(warnings)
//     })
// })

async function getCurrentTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    return tab
}

async function getCurrentOrigin() {
    const tab = await getCurrentTab()
    let origin = new URL(tab.url).origin
    if (!origin.endsWith("/")) {
        origin += "/"  // requestPermission requires this forward slash to work
    }
    return origin
}



const searchButton = document.querySelector("#search_button")
const searchInput = document.querySelector("#search_input")
const content_div = document.querySelector("#content")

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

// document.addEventListener("keyup", (e) => {

//     // console.log(e);
//     // console.log(document.activeElement);

//     if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.repeat) {
//         return;
//     }
//     if (["INPUT", "TEXTAREA", "SUMMARY"].includes(document.activeElement.nodeName)) {
//         return;
//     }
    
//     if (document.activeElement != searchInput) {
//         // type anywhere to focus on search input and start typing in it
//         e.preventDefault()
//         searchInput.focus()
//         document.dispatchEvent(e)
//         // searchInput.value += e.key
//         // doSearchAfterDelay();  // we are changing input directly, wouldnt fire event, so trigger it manually
//     }
// })
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
    content_div.classList.add("loading")
    searchButton.classList.add("loading")

    const searchText = searchInput.value
    // console.log("searching", searchText);
    const parsed = parseRecursive(await getLocalStorageContent(), await getMaxDepth())
    const trimmed = trimNotContainInPlace(parsed, searchText)
    // console.log("trimmed", trimmed);

    await refreshUI(trimmed)

    searchButton.classList.remove("loading")
    content_div.classList.remove("loading")
    searchButton.disabled = false
}

// re-create html tree with given node
async function refreshUI(parsedNode) {

    deleteHtmlContainerIn(content_div)

    const lastUpdated = new Date()

    insertStats(parsedNode, lastUpdated)

    const inserted = insertHtmlRecursive(parsedNode, content_div, await getMaxDepth())

    if (inserted === null) {
        document.querySelector("#empty_label").classList.remove("display_none")
    } else {
        document.querySelector("#empty_label").classList.add("display_none")
    }
}

// add stats
function insertStats(node, lastUpdated) {
    const statsNode = document.querySelector("#stats")
    let entries, size;
    if (!node) {
        entries = "empty"
        size = 0
    } else {
        entries = Object.keys(node.children).length

        const blob = new Blob([node.clipboard_value], {
            type: "application/json",
        })
        size = toHumanSize(blob.size)
    }
    
    // console.log("blob", blob);
    statsNode.innerHTML = `${entries} entries of size ${size} at ${toHumanDate(lastUpdated)}`
}
function toHumanSize(kb) {
    if (kb >= 1000_000) {
        return `${(kb / 1000_000).toFixed(2)} GB`
    } else if (kb >= 1000) {
        return `${(kb / 1000).toFixed(2)} MB`
    } else {  // (kb < 1000)
        return `${kb.toFixed(2)} KB`
    }
}
function pad(any, pad, size) {
    let s = new String(any)
    while (s.length < size) {
        s = pad + s
    }
    return s
}
function toHumanDate(date) {
    return `${pad(date.getHours(), 0, 2)}:${pad(date.getMinutes(), 0, 2)}:${pad(date.getSeconds(), 0, 2)}`
}


function trimNotContainInPlace(node, text) {
    // console.log("trim text", text);
    // console.log("trim node", node);
    if (text === "") {
        // console.log("returning node text empty");
        return node
    }
    if (!node) {
        // console.log("returning null");
        return null;
    }
    if (node.is_leaf) {
        if (node.clipboard_value && node.clipboard_value.toLowerCase().includes(text.toLowerCase())) {
            // console.log("returning node is leaf");
            return node
        } else {
            // console.log("returning null leaf no match");
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
            // console.log("returning node children not empty");
            return node
        } else {
            // console.log("returning null children empty");
            return null;
        }
    }
}

// feat: refresh, this is same as click
const refreshButton = document.querySelector("#refresh_button")
refreshButton.onclick = async function () {
    refreshButton.disabled = true
    refreshButton.classList.add("loading")
    await searchButton.click()
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
    const origin = await getCurrentOrigin()
    const settings = await browser.storage.sync.get(origin)
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
    const origin = await getCurrentOrigin()
    const toSave = {}
    toSave[origin] = settings
    await browser.storage.sync.set(toSave)
}


async function getLocalStorageContent() {
    if (browser.scripting === undefined) {
        return undefined
    }
    const tab = await getCurrentTab()
    const execution = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ ...localStorage }),
    })
    return execution[0].result;
}

function parseRecursive(raw, depth) {
    return parseRecursiveInternal(raw, depth, 0)
}

function parseRecursiveInternal(raw, max_depth, depth) {

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
        has_parent: depth > 1,
        depth: depth
    }

    // set is_leaf
    if (depth < max_depth) {
        if (node.is_object) {
            node.is_leaf = false
            for (const [k, v] of Object.entries(node.js_value)) {
                node.children[k] = parseRecursiveInternal(v, max_depth, depth+1)
            }
        } else if (node.is_array) {
            node.is_leaf = false
            node.js_value.forEach((value, i) => {
                node.children[i] = parseRecursiveInternal(value, max_depth, depth+1)
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

    // const visibilityElement = nodeContainer.querySelector(".visibility");
    // visibilityElement.onclick = async () => {
    //     nodeContainer && nodeContainer.classList.toggle("hide_children")
    // }

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

    // const downRightElement = nodeContainer.querySelector(".down_right")
    // if (node.has_parent) {
    //     downRightElement.classList.remove("display_none")
    // }

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

// permissions

// async function checkScriptingPermission() {
//     let granted = false;
//     const origin = await getCurrentOrigin()
//     await browser.permissions.getAll().then(permissions => {
//         console.log("permission", permissions);
//         let originListed = false
//         for (const listedOrigin of permissions.origins) {
//             if (listedOrigin.startsWith(origin)) {
//                 originListed = true;
//                 break
//             }
//         }
//         if (originListed) {
//             granted = permissions.permissions.includes('scripting')
//         }
//     })

//     // does not work in chrome
//     // await browser.permissions.contains({
//     //     permissions: ['scripting'],
//     //     origins: [origin]
//     // }, (result) => {
//     //     granted = result
//     // });

//     return granted
// }

const access_div = document.querySelector("#access_div")
async function checkPermission() {
    access_div.classList.remove("display_none")

    const origin = await getCurrentOrigin()
    // reject all non webpage url
    if (!origin.startsWith("https://") && !origin.startsWith("http://")) {
        document.querySelector("#access_hint").textContent = `Cannot access non http/https webpage`
        access_button.remove(); // remove access button because cant request access for this page
    }

    // const granted = await checkScriptingPermission()
    const granted = (await getLocalStorageContent()) !== undefined  // as long as we get local storage successfully, then we have permissions
    // console.log("getLocalStorageContent", getLocalStorageContent());
    // console.log("check permission", granted);
    if (granted) {
        access_div.classList.add("display_none")
        return true
    } else {
        const origin = await getCurrentOrigin()
        document.querySelector("#access_text").textContent = `No permission to access ${origin}`
        return false
    }
}

// feat: request access

const origin = await getCurrentOrigin(); // this must be placed outside of the handler for request permissions to work, no idea
const access_button = document.querySelector("#access_button")
access_button.addEventListener('click', async e => {
    access_button.disabled = true
    access_button.classList.add("loading")

    // setTimeout(() => { // the extension popup may be blocking the browser request permission popup
    //     window.close()
    // }, 500);
    console.log("origin", origin);
    console.log("browser.permissions", browser.permissions);
    console.log("browser.permissions.request", browser.permissions.request);

    setTimeout(() => {
        window.close()
    }, 100);
    await browser.permissions.request({
        permissions: ["scripting"],
        origins: [origin]
    }); // chrome does not have second argument callback

    const granted = checkPermission()
    if (granted) {
        searchButton.click()
    }

    access_button.classList.remove("loading")
    access_button.disabled = false
});


// close button
document.querySelector("#close_button").addEventListener('click', event => window.close());

(async function main() {
    searchInput.focus()
    await checkPermission().then(async granted => {
        if (granted) {
            await searchButton.click()
        }
    })
})()