const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function scrape() {
    console.log(' Starting FMP scraper...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        let capturedData = null;
        
        await page.setRequestInterception(true);
        
        page.on('response', async (response) => {
            if (response.url().includes('api.fmp.live/query') && response.status() === 200) {
                try {
                    capturedData = await response.json();
                    console.log('✅ Intercepted API data!');
                } catch (e) {
                    console.error('JSON parse error');
                }
            }
        });
        
        console.log('🌐 Navigating to fmp.live...');
        await page.goto('https://fmp.live/#live', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        await new Promise(r => setTimeout(r, 5000));
        
        if (capturedData && capturedData.data) {
            console.log(' Processing data...');
            const processedData = processData(capturedData.data);
            
            const outputPath = path.join(process.cwd(), 'fmp_data.json');
            fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
            console.log(`💾 Saved ${processedData.length} matches to fmp_data.json`);
        } else {
            console.log('️ No data captured');
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
}

function processData(rawData) {
    const matches = {};
    
    if (Array.isArray(rawData.liveList)) {
        rawData.liveList.forEach(match => {
            const comp = match.competition || match;
            const id = String(match.id || comp.id);
            
            let homeName = comp.homeTeam?.nameEn || match.homeTeam?.nameEn;
            let awayName = comp.awayTeam?.nameEn || match.awayTeam?.nameEn;
            
            if (!homeName || !awayName) {
                const parts = (match.title || '').split(/\s+(?:VS|vs|v|V)\s+/i);
                homeName = homeName || (parts[0] || 'Home').trim();
                awayName = awayName || (parts[1] || 'Away').trim();
            }
            
            let m3u8 = match.pullUrlM3U8 || comp.pullUrlM3U8;
            if (!m3u8 && match.streams && Array.isArray(match.streams)) {
                for (const stream of match.streams) {
                    if (stream.m3u8) {
                        m3u8 = stream.m3u8;
                        break;
                    }
                }
            }
            
            const status = (match.status || comp.status || 'SCHEDULED').toUpperCase();
            
            matches[id] = {
                id,
                home_name: homeName,
                home_img: comp.homeTeam?.logo || match.homeTeam?.logo || '',
                away_name: awayName,
                away_img: comp.awayTeam?.logo || match.awayTeam?.logo || '',
                league: comp.contest?.nameEn || match.contest?.nameEn || 'League',
                match_time: match.matchTime || comp.matchTime || '',
                match_status: ['FIRST_HALF', 'SECOND_HALF', 'LIVE', 'HALF_TIME'].includes(status),
                homeScore: match.homeScore ?? comp.homeScore ?? 0,
                awayScore: match.awayScore ?? comp.awayScore ?? 0,
                status: status,
                links: m3u8 ? [{ name: match.title || 'Live Stream', url: m3u8 }] : []
            };
        });
    }
    
    if (Array.isArray(rawData.competitionList)) {
        rawData.competitionList.forEach(group => {
            if (Array.isArray(group.lives)) {
                group.lives.forEach(compMatch => {
                    const id = String(compMatch.id);
                    if (matches[id]) {
                        matches[id].homeScore = compMatch.homeScore ?? matches[id].homeScore;
                        matches[id].awayScore = compMatch.awayScore ?? matches[id].awayScore;
                        
                        const newStatus = (compMatch.status || matches[id].status).toUpperCase();
                        matches[id].status = newStatus;
                        matches[id].match_status = ['FIRST_HALF', 'SECOND_HALF', 'LIVE', 'HALF_TIME'].includes(newStatus);
                    }
                });
            }
        });
    }
    
    return Object.values(matches);
}

scrape();