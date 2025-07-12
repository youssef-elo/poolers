const axios = require('axios');
require('dotenv').config();

// 42 API endpoints
const API_BASE_URL = 'https://api.intra.42.fr';
const TOKEN_URL = `${API_BASE_URL}/oauth/token`;

async function getAccessToken() {
  try {
    const response = await axios.post(TOKEN_URL, {
      grant_type: 'client_credentials',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchAllCampuses() {
  try {
    const accessToken = await getAccessToken();
    
    console.log('Fetching all campuses from 42 School API...');
    
    let allCampuses = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const response = await axios.get(`${API_BASE_URL}/v2/campus`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          'page[size]': 100,
          'page[number]': page
        }
      });
      
      const campuses = response.data;
      allCampuses = allCampuses.concat(campuses);
      
      console.log(`Fetched page ${page} - ${campuses.length} campuses`);
      
      // Check if there are more pages
      hasMore = campuses.length === 100;
      page++;
    }
    
    console.log(`Total campuses fetched: ${allCampuses.length}`);
    
    // Sort campuses by country then by name
    allCampuses.sort((a, b) => {
      if (a.country !== b.country) {
        return a.country.localeCompare(b.country);
      }
      return a.name.localeCompare(b.name);
    });
    
    return allCampuses;
  } catch (error) {
    console.error('Error fetching campuses:', error.response?.data || error.message);
    throw error;
  }
}

// Main execution
fetchAllCampuses()
  .then(campuses => {
    const fs = require('fs');
    
    // Create a comprehensive campuses data file
    const campusData = {
      metadata: {
        fetchedAt: new Date().toISOString(),
        totalCampuses: campuses.length,
        countries: [...new Set(campuses.map(c => c.country))].sort()
      },
      campuses: campuses.map(campus => ({
        id: campus.id,
        name: campus.name,
        city: campus.city,
        country: campus.country,
        timezone: campus.time_zone,
        website: campus.website,
        address: campus.address,
        zip: campus.zip,
        vogsphere_id: campus.vogsphere_id,
        active: campus.active,
        public: campus.public,
        email_extension: campus.email_extension,
        default_hidden_phone: campus.default_hidden_phone
      }))
    };
    
    // Write to JSON file
    fs.writeFileSync('/workspaces/poolers/all_campuses.json', JSON.stringify(campusData, null, 2));
    
    // Create a markdown file with formatted data
    let markdown = `# 42 School Campuses Worldwide\n\n`;
    markdown += `**Total Campuses:** ${campuses.length}\n`;
    markdown += `**Countries:** ${campusData.metadata.countries.length}\n`;
    markdown += `**Last Updated:** ${new Date().toLocaleDateString()}\n\n`;
    
    // Group by country
    const byCountry = {};
    campuses.forEach(campus => {
      if (!byCountry[campus.country]) {
        byCountry[campus.country] = [];
      }
      byCountry[campus.country].push(campus);
    });
    
    // Generate markdown by country
    Object.keys(byCountry).sort().forEach(country => {
      markdown += `## ${country}\n\n`;
      byCountry[country].forEach(campus => {
        markdown += `- **${campus.name}** (${campus.city})`;
        if (campus.website) {
          markdown += ` - [Website](${campus.website})`;
        }
        if (!campus.active) {
          markdown += ` ⚠️ *Inactive*`;
        }
        markdown += `\n`;
      });
      markdown += `\n`;
    });
    
    // Add statistics
    markdown += `## Statistics\n\n`;
    markdown += `| Country | Campus Count |\n`;
    markdown += `|---------|-------------|\n`;
    Object.keys(byCountry).sort().forEach(country => {
      markdown += `| ${country} | ${byCountry[country].length} |\n`;
    });
    
    fs.writeFileSync('/workspaces/poolers/CAMPUSES.md', markdown);
    
    console.log('✅ Campus data saved to:');
    console.log('  - all_campuses.json (complete data)');
    console.log('  - CAMPUSES.md (formatted documentation)');
    console.log(`\n📊 Summary:`);
    console.log(`  - Total campuses: ${campuses.length}`);
    console.log(`  - Countries: ${campusData.metadata.countries.length}`);
    console.log(`  - Active campuses: ${campuses.filter(c => c.active).length}`);
    console.log(`  - Inactive campuses: ${campuses.filter(c => !c.active).length}`);
  })
  .catch(error => {
    console.error('❌ Failed to fetch campuses:', error.message);
    process.exit(1);
  });
