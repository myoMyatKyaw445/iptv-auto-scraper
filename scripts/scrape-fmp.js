const fs = require('fs');
const path = require('path');

// ဒီနေ့ရက်စွဲကို ဝဘ်ဆိုက်လိုအပ်တဲ့ ပုံစံအတိုင်း ဖန်တီးခြင်း (ဥပမာ - 2026-09-15T00:00:00.000000000+08:00)
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const matchTime = `${yyyy}-${mm}-${dd}T00:00:00.000000000+08:00`;

// မင်းတွေ့လိုက်တဲ့ GraphQL Query (m3u8 link တွေပါရအောင် ထပ်ဖြည့်ထားပါတယ်)
const graphqlQuery = `
  query CompetitionList($page: Int!, $pageSize: Int!, $matchTime: Time, $category: CompetitionCategory) {
    competitionList(
      page: $page
      pageSize: $pageSize
      matchTime: $matchTime
      category: $category
    ) {
      id
      title
      status
      matchTime
      homeScore
      awayScore
      pullUrlM3U8
      streams {
        m3u8
      }
      contest {
        id
        nameEn
        logo
      }
      homeTeam {
        id
        nameEn
        logo
      }
      awayTeam {
        id
        nameEn
        logo
      }
    }
  }
`;

async function scrape() {
    console.log('🚀 Starting Direct GraphQL Fetch...');
    
    try {
        const response = await fetch('https://api.fmp.live/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://fmp.live',
                'Referer': 'https://fmp.live/'
            },
            body: JSON.stringify({
                operationName: "CompetitionList",
                query: graphqlQuery,
                variables: {
                    page: 1,
                    pageSize: 50, // LIVE ပွဲအကုန်ရအောင် 50 ထားလိုက်ပါတယ်
                    category: "LIVE",
                    matchTime: matchTime
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.data && result.data.competitionList) {
            console.log(`✅ Successfully fetched ${result.data.competitionList.length} matches!`);
            const processedData = processData(result.data.competitionList);
            
            const outputPath = path.join(process.cwd(), 'fmp_data.json');
            fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
            console.log(`💾 Successfully saved to fmp_data.json`);
        } else {
            console.log('❌ No data found in response.');
            console.log('Response:', JSON.stringify(result).substring(0, 200) + '...');
        }

    } catch (error) {
        console.error('❌ Fetch Error:', error.message);
    }
}

function processData(matches) {
    return matches.map(match => {
        // m3u8 URL ကို ရှာဖွေခြင်း
        let m3u8 = match.pullUrlM3U8;
        if (!m3u8 && match.streams && Array.isArray(match.streams)) {
            for (const stream of match.streams) {
                if (stream.m3u8) {
                    m3u8 = stream.m3u8;
                    break;
                }
            }
        }

        const status = (match.status || 'SCHEDULED').toUpperCase();

        return {
            id: String(match.id),
            home_name: match.homeTeam?.nameEn || 'Home Team',
            home_img: match.homeTeam?.logo || '',
            away_name: match.awayTeam?.nameEn || 'Away Team',
            away_img: match.awayTeam?.logo || '',
            league: match.contest?.nameEn || 'League',
            match_time: match.matchTime || '',
            match_status: ['FIRST_HALF', 'SECOND_HALF', 'LIVE', 'HALF_TIME'].includes(status),
            homeScore: match.homeScore ?? 0,
            awayScore: match.awayScore ?? 0,
            status: status,
            links: m3u8 ? [{ name: match.title || 'Live Stream', url: m3u8 }] : []
        };
    });
}

scrape();