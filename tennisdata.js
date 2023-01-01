const lineupURL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT4zQPjVIC8C0Em_oSfAroQWfg6OZH8Z6FBASyv88J79G2H5fJv8QMnEc59TbIRGk5u0HISMnrVhHrQ/pub?output=csv";
const availabilityURL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRl-2yO1tkwcqkqk273eAE-Cub-eddS6cRo31UMEG8Gpld-jS1tSkg4ULjyQgPodNXK58_F8TmnQFVf/pub?output=csv";

function verifyKeyExists(map, key, defaultVal = {}) {
    if (!(key in map)) {
        map[key] = defaultVal;
    }
}

function setOrInc(map, key, defaultVal = 1, incrVal = 1) {
    if (key in map) map[key] = map[key] + incrVal;
    else map[key] = defaultVal;
}

function getValueOrDefault(map, key, defaultVal = "") {
    if (key in map) return map[key];
    else return defaultVal;
}

function getValueOrDefaultTwice(map, key, subkey, defaultVal = "") {
    if (key in map) if (subkey in map[key]) return map[key][subkey];

    return defaultVal;
}

function minTwoDigits(s) {
    return s.length > 1 ? s : "0" + s
}

function parseUSDate(dateString) {
    const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    let match = dateString.match(re);
    dateString = match[3] + "-" + match[1] + "-" + match[2];
    let dateVal = Date.parse(dateString);
    return dateVal;
}

Papa.parsePromise = function (file) {
    return new Promise(function (complete, error) {
        Papa.parse(file, { complete, error, download: true });
    });
};

$(function(){
    //Set cutoff to next Tues
    let d = new Date();
    d.setDate(d.getDate() + (2 + 7 - d.getDay()) % 7);  
    document.getElementById("cutoffDate").valueAsDate = d;

    document.getElementById("startDate").addEventListener('change', getData);
    document.getElementById("cutoffDate").addEventListener('change', getData);

    
    let pcols = [
        { title: "Name" },
        { title: "Nights Left Out" },
        { title: "Last Played" },
        { title: "Last Screwed" },
        { title: "Times Available" },
        { title: "Times Played" },
    ];
    $("#playerHistoryTable").DataTable({
        columns: pcols,
        order: [
            [1, "desc"],
            [2, "asc"],
            [3, "desc"],
        ],
        info: false,
        searching: false,
        paging: false,
    });

    getData();
});

function getData() {
    let startDate = Date.parse(document.getElementById("startDate").value);
    if( isNaN(startDate) )
        startDate = 0
    let endDate = Date.parse(document.getElementById("cutoffDate").value);

    //Build up in analyzing lineups, used for left out processing
    let dateMap = {};
    let playerStats = {};

    Papa.parsePromise(lineupURL)
        .then(function (results) {
            let matchupsMap = {};
            let d = results.data;

            //Build matchupsTable and dateMap
            for (let r of d) {
                let date = r[0];
                let dateVal = parseUSDate(date);

                if(dateVal < startDate || dateVal > endDate ) {
                    continue;
                }

                verifyKeyExists(dateMap, date);

                for (let p of r.slice(2)) {
                    verifyKeyExists(playerStats, p);
                    playerStats[p]["lastPlayed"] = date;
                    
                    setOrInc(playerStats[p], "plays");

                    dateMap[date][p] = true;

                    for (let p2 of r.slice(2)) {
                        if (p !== p2) {
                            verifyKeyExists(matchupsMap, p, []);
                            setOrInc(matchupsMap[p], p2);
                        }
                    }
                }
            }
            
            let cols = [{ title: "Name" }];

            //Turn matchupsMap into a 2D array for data table
            let matchups = [];
            for (let p of Object.keys(matchupsMap).sort()) {
                let header = p.split(" ").join("<br>");
                cols.push({ title: header });

                let line = [];
                line.push(p);
                for (let p2 of Object.keys(matchupsMap).sort()) {
                    if (matchupsMap[p][p2]) line.push(matchupsMap[p][p2]);
                    else line.push(0);
                }
                matchups.push(line);
            }


            if( $.fn.DataTable.isDataTable( '#matchupsTable' ) )
                $("#matchupsTable").DataTable().destroy();

            $("#matchupsTable").html("").DataTable({
                data: matchups,
                columns: cols,
                info: false,
                searching: false,
                paging: false,
            });
        
            
            //Now parse the availability data
            return Papa.parsePromise(availabilityURL);
        })
        .then(function (results) {
            let data = results.data;

            let screwCounts = {};
            let screwDates = {};
            let attemptCounts = {};

            for (let r of data.slice(1)) {
                let player = r[0] + " " + r[1];
                screwCounts[player] = 0;
                attemptCounts[player] = 0;
            }

            for (let colInd = 3; colInd < data[0].length; colInd++) {
                const re = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
                let date = data[0][colInd].match(re)[0];
                let dateVal = parseUSDate(date);

                if(dateVal < startDate || dateVal > endDate ) {
                    continue;
                }

                for (let rowInd = 1; rowInd < data.length; rowInd++) {
                    let name = data[rowInd][0] + " " + data[rowInd][1];
                    let status = data[rowInd][colInd];
                    if (status === "yes" || status === "maybe") {
                        setOrInc(attemptCounts, name);

                        if (date in dateMap && !(name in dateMap[date]) && !getValueOrDefaultTwice(screwDates, date, name) ) {
                            setOrInc(screwCounts, name);
                            playerStats[name]['lastScrewed'] = date;
                            verifyKeyExists(screwDates, date);
                            verifyKeyExists(screwDates[date], name, true);
                        }
                    }
                }
            }

            let playerTable = [];
            for (let p of Object.keys(attemptCounts).sort()) {
                let line = [];
                line.push(p);
                line.push(screwCounts[p]);
                line.push(getValueOrDefaultTwice(playerStats, p, "lastPlayed"));
                line.push(getValueOrDefaultTwice(playerStats, p, "lastScrewed"));
                line.push(attemptCounts[p]);
                line.push(
                    getValueOrDefaultTwice(playerStats, p, "plays", 0)
                );
                playerTable.push(line);
            }

            $("#playerHistoryTable").DataTable().clear();
            $("#playerHistoryTable").DataTable().rows.add(playerTable);
            $("#playerHistoryTable").DataTable().draw();
        });
}
