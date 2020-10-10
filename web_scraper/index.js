// external imports
const puppeteer = require('puppeteer');
const fs = require('fs');

// internal imports

// constants
const BROWSER_INIT_OPTIONS = {
    headless: false,
    slowMo: 250
};

// implementation
let mainBrowser = null;

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const openPage = async (path) => {
    const page = await mainBrowser.newPage();
    await page.goto(path);
    await page.waitForSelector('#footer');

    return page;
};

const parseMemberData = async (page) => {
    const $fromGroups = await page.$$('.form-group');

    if ($fromGroups.length <= 0) {
        return null
    }

    let completeData = {};

    for await (let $fromGroup of $fromGroups) {
        const fromGroupData = await $fromGroup.evaluate(async ($groupNode) => {
            const parseSectionData = async ($node) => {
                switch ($node.nodeName.toLowerCase()) {
                    case 'address': {
                        return $node.textContent;
                    }

                    case 'ul': {
                        const $lis = $node.querySelectorAll('li');

                        if ($lis === undefined || $lis === null) {
                            return null
                        } else {
                            const dataArray = [];

                            $lis.forEach($li => {
                                const $a = $li.querySelector('a');

                                if ($a !== undefined && $a !== null) {
                                    dataArray.push({
                                        data: $a.textContent,
                                        link: $a.href
                                    })
                                } else {
                                    dataArray.push($li.textContent);
                                }
                            });

                            return dataArray;
                        }
                    }

                    default: {
                        switch ($node.children[0].nodeName.toLowerCase()) {
                            case 'span': {
                                return $node.textContent;
                            }

                            case 'a': {
                                return {
                                    data: $node.textContent.length > 0 ? $node.textContent : $node.children[0].textContent,
                                    link: $node.children[0].href,
                                }
                            }

                            case 'p': {
                                const $a = $node.querySelector('a');

                                if ($a !== null && $a !== undefined) {
                                    return {
                                        data: $node.textContent,
                                        link: $a.href,
                                    }
                                } else {
                                    return $node.textContent;
                                }
                            }

                            default: {
                                return null;
                            }
                        }
                    }
                }
            };

            const $sectionName = $groupNode.querySelector('label');

            if ($sectionName === null || $sectionName === undefined) {
                return null;
            }

            const $sectionData = ($groupNode.children[2] !== undefined && $groupNode.children[2] !== null) ? $groupNode.children[2] : $groupNode.children[1];

            if ($sectionData === null || $sectionData === undefined) {
                return null;
            }

            const sectionName = $sectionName.textContent;

            if ($sectionData.childElementCount <= 0) {
                return {
                    [sectionName]: $sectionData.textContent
                };
            }

            const sectionData = await parseSectionData($sectionData);

            return {
                [sectionName]: sectionData
            };
        });

        completeData = Object.assign(completeData, fromGroupData);
    }

    return completeData;
};

const parseMember = async ($thumbEntity) => {
    const $linkToProfile = await $thumbEntity.$('a');

    if ($linkToProfile === undefined || $linkToProfile === null) {
        return null;
    }

    let linkToProfile = null;

    try {
        linkToProfile = await $linkToProfile.evaluate($node => $node.href);
    } catch (e) {
        return null;
    }

    if (linkToProfile === undefined || linkToProfile === null) {
        return null;
    }

    const memberPage = await openPage(linkToProfile);
    const data = await parseMemberData(memberPage);
    await memberPage.close();

    return data;
};

const run = async () => {
    mainBrowser = await puppeteer.launch(BROWSER_INIT_OPTIONS);
    const page = await openPage('https://intus.austinbar.org/directory/default.aspx?page=1');

    const $memberThumbEntities = await page.$$('.directory-search-item');

    fs.open('parsed.json', 'w', async (err, fd) => {
        if (err) {
            await mainBrowser.close();
            throw 'could not open file: ' + err;
        }

        if ($memberThumbEntities.length > 0) {
            fs.writeSync(fd, new Buffer.from('['), 0, 1, null);

            let cnt = 0;

            for await (let $thumbEntity of $memberThumbEntities) {
                console.log(`Parsing member ${cnt}...`);
                const data = await parseMember($thumbEntity);

                console.log('Data:');
                console.log(data);

                if (data !== null) {
                    let buffer = new Buffer.from(cnt > 0 ? `,${JSON.stringify(data)}` : JSON.stringify(data));

                    fs.writeSync(fd, buffer, 0, buffer.length, null);
                }

                cnt += 1;
            }

            fs.writeSync(fd, new Buffer.from(']'), 0, 1, null);

            fs.close(fd, async () => {
                await mainBrowser.close();
            });
        }
    });



};

run().then(() => console.log('exit'));
