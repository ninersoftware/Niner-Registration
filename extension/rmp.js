const CACHE_DURATION = 3 * 24 * 60 * 60 * 1000; //3 day cache size
const CACHE_SIZE = 100;
const CACHE_VERSION = 'v2';
const REPLACEMENTS = {
    "Ree Linker": "Jeanne-Marie Linker",
    "Hamid Baradaran Shoraka" : "Hamid Shoraka",
    "Maria Guimaraes Biagini" : "Maria Guimaraes",
    "Dave Naylor" : "David Naylor",
    "Jay Wu" : "Jy Wu",
    "Dave Weggel" : "David Weggel",
    "Jeff Raquet" : "Jeffrey Raquet",
    "Garry Hodgins" : "Martin Hodgins",
    "Kosta Falaggis" : "Konstantinos Falaggis",
    "Jim Conrad" : "James Conrad",
    "Nigel Zheng" : "Naiquan Zheng",
    "Gary Teng" : "Teng Gary",
    "Sam Shue" : "Samuel Shue",
    "Zbyszek Ras" : "Zbigniew Ras",
    "Tom Moyer" : "Thomas Moyer",
    "Chao Wang" : "Wiechao Wang",
    "Carmen Soliz Urrutia" : "Maria Carmen Soliz Urrutia",
    "Katie Hogan" : "Kathleen Hogan",
    "Juan Meneses Naranjo" : "Juan Meneses",
    "Becky Roeder" : "Rebecca Roeder",
    "Pilar Blitvich" : "Maria Pilar Garces-Conejos Blitvich"
}; //manual replacements

async function maintainCacheSize() {
    const allItems = await chrome.storage.local.get(null);
    const entries = Object.entries(allItems)
        .filter(([, value]) => value && value.timestamp)
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    if (entries.length > CACHE_SIZE) {
        const toDelete = entries.slice(0, 50).map(([key]) => key);
        await chrome.storage.local.remove(toDelete);
    }
}

function normalize(str) {
    return str.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\u00A0/g, ' ')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/-/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function namesMatch(searchName, firstName, lastName) {
    const fullRMP = normalize(`${firstName} ${lastName}`);
    const search = normalize(searchName);

       if (search === fullRMP) {
        return true;
    }

    const searchLast = search.split(' ').pop();
    
    const searchParts = search.split(' ');
    const rmpParts = fullRMP.split(' ');

    const searchFirstFull = searchParts[0];
    const searchLastFull = searchParts[searchParts.length - 1];
    
    const rmpFirstFull = rmpParts[0];
    const rmpLastFull = rmpParts[rmpParts.length - 1];

    if (searchFirstFull === rmpLastFull && searchLastFull === rmpFirstFull) {
        return true;
    }

    const rmpLastParts = normalize(lastName).split(' ');
    if (!rmpLastParts.includes(searchLast)) {
        return false;
    }

    if (
        (rmpFirstFull.startsWith(searchFirstFull.slice(0, 3)) ||
         searchFirstFull.startsWith(rmpFirstFull.slice(0, 3))) &&
        searchLastFull === rmpLastFull
    ) {    return true;
    }

    return false;
}

async function queryRMP(name) {
    const resolvedName = REPLACEMENTS[name] || name; 
    const queryName = normalize(resolvedName).split(' ').pop();
    const cacheKey = `rmp_${CACHE_VERSION}_${resolvedName.toLowerCase().trim()}`;
    const stored = await chrome.storage.local.get(cacheKey);
    const cached = stored[cacheKey];
    console.log('cache check for', name, '-- hit:', !!cached);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        return cached.data;
    }

    const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36",
    "Content-Type": "application/json",
    "Origin": "https://www.ratemyprofessors.com",
    "Referer": "https://www.ratemyprofessors.com"
    }
    const response = await fetch("https://www.ratemyprofessors.com/graphql", {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
        query: `
        query {
            newSearch {
                teachers(query: {text: "${queryName}", schoolID: "U2Nob29sLTEyNTM="}) {
                    edges {
                        node {
                            legacyId
                            firstName
                            lastName
                            avgRating
                            avgDifficulty
                            wouldTakeAgainPercent
                            numRatings
                            department
                            ratings(first: 1) { 
                                edges {
                                    node {
                                        date
                                    }
                                }
                            }   
                        }
                    }
                }
            }
        }
        `
        })
    });

    let data;
    try {
        data = await response.json();
    } catch(e) {
        return null;
    }
    
    if (!data?.data?.newSearch?.teachers?.edges) {
        return null;
    }
    const professors = data.data.newSearch.teachers.edges;

    if (!professors.length) {
        await chrome.storage.local.set({ [cacheKey]: {data : null, timestamp: Date.now()}});
        return null;
    }

    const matches = professors.filter(edge => {
        return namesMatch(resolvedName, edge.node.firstName, edge.node.lastName)
    });
    
    if (!matches.length) {
        await chrome.storage.local.set({ [cacheKey]: { data: null, timestamp: Date.now()}});
        return null;
    }
    
    const match = matches.reduce((best, current) =>
        current.node.numRatings > best.node.numRatings ? current : best
    );

    const prof = match.node
    const lastRating = prof.ratings?.edges[0]?.node?.date || null;
    prof.lastRating = lastRating;

    await maintainCacheSize();
    await chrome.storage.local.set({ [cacheKey]: { data: prof, timestamp: Date.now()}});
    
    return prof;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.professorName) {
        queryRMP(request.professorName)
            .then(data => {
                if (data && data.numRatings > 0) {
                    sendResponse({success:true, data});
                } else {
                    sendResponse({success: false, error: "Not found"});
                }
            })
            .catch(err => sendResponse({success: false, error: err.message}));
        return true;
    }
});
