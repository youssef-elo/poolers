const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Set up EJS as the templating engine
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Store user sessions in memory (for production, use proper session storage)
const sessions = new Map();

// Morocco campus IDs for quick reference
const MOROCCO_CAMPUSES = {
  KHOURIBGA: 16,
  BENGUERIR: 21,
  RABAT: 75,
  TETOUAN: 55
};

// Campus filter mapping (from UI values to actual campus IDs)
const CAMPUS_FILTER_MAP = {
  '1337-khouribga': 16,
  '1337-ben-guerir': 21,
  '1337-med': 75,
  '42-benguerir': 21
};

// Morocco campus details (static data to avoid repeated API calls)
const MOROCCO_CAMPUS_INFO = {
  16: { name: 'Khouribga', city: 'Khouribga', country: 'Morocco' },
  21: { name: 'Benguerir', city: 'Benguerir', country: 'Morocco' },
  75: { name: 'Rabat', city: 'Rabat', country: 'Morocco' },
  55: { name: 'Tétouan', city: 'Tétouan', country: 'Morocco' }
};

// 42 API endpoints
const API_BASE_URL = 'https://api.intra.42.fr';
const OAUTH_URL = `${API_BASE_URL}/oauth/authorize`;
const TOKEN_URL = `${API_BASE_URL}/oauth/token`;

// Helper function to generate random state
function generateState() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Helper function to make API requests with user token and rate limiting
async function makeAPIRequest(endpoint, userToken, retries = 3) {
  try {
    const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    });
    return response.data;
  } catch (error) {
    if (error.response?.status === 429 && retries > 0) {
      // Rate limit exceeded, wait and retry
      const waitTime = Math.pow(2, 4 - retries) * 1000; // Exponential backoff: 2s, 4s, 8s
      console.log(`Rate limit exceeded, waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return makeAPIRequest(endpoint, userToken, retries - 1);
    }
    console.error(`Error making API request to ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

// Helper function to add delay between requests
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Routes
app.get('/', async (req, res) => {
  const sessionId = req.query.session;
  const userSession = sessionId ? sessions.get(sessionId) : null;
  
  try {
    res.render('index', { 
      students: null, 
      error: null, 
      campus: null, 
      user: userSession ? userSession.user : null,
      sessionId: sessionId
    });
  } catch (error) {
    res.render('index', { 
      students: null, 
      error: error.message, 
      campus: null, 
      user: null,
      sessionId: null
    });
  }
});

// Login route - redirect to 42 OAuth
app.get('/login', (req, res) => {
  const state = generateState();
  const authUrl = `${OAUTH_URL}?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&state=${state}&scope=public`;
  
  // Store state for verification
  sessions.set(state, { state, timestamp: Date.now() });
  
  res.redirect(authUrl);
});

// OAuth callback route
app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || !state) {
    return res.render('index', { 
      students: null, 
      error: 'Authentication failed: Missing code or state', 
      campus: null, 
      user: null,
      sessionId: null
    });
  }
  
  // Verify state
  const storedSession = sessions.get(state);
  if (!storedSession) {
    return res.render('index', { 
      students: null, 
      error: 'Authentication failed: Invalid state', 
      campus: null, 
      user: null,
      sessionId: null
    });
  }
  
  try {
    // Exchange code for access token
    const tokenResponse = await axios.post(TOKEN_URL, {
      grant_type: 'authorization_code',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code: code,
      redirect_uri: process.env.REDIRECT_URI
    });
    
    const accessToken = tokenResponse.data.access_token;
    
    // Get user info
    const userInfo = await makeAPIRequest('/v2/me', accessToken);
    
    // Create user session
    const sessionId = generateState();
    sessions.set(sessionId, {
      user: userInfo,
      accessToken: accessToken,
      timestamp: Date.now()
    });
    
    // Redirect to home with session
    res.redirect(`/?session=${sessionId}`);
    
  } catch (error) {
    console.error('OAuth error:', error.response?.data || error.message);
    res.render('index', { 
      students: null, 
      error: 'Authentication failed: ' + (error.response?.data?.error_description || error.message), 
      campus: null, 
      user: null,
      sessionId: null
    });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  const sessionId = req.query.session;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  res.redirect('/');
});

app.get('/students', async (req, res) => {
  const sessionId = req.query.session;
  const userSession = sessionId ? sessions.get(sessionId) : null;
  
  if (!userSession) {
    return res.render('index', { 
      students: null, 
      error: 'Please login first to view students', 
      campus: null, 
      user: null,
      sessionId: null
    });
  }
  
  try {
    // Use the specific Khouribga campus ID and static info
    const khouribgaCampusId = MOROCCO_CAMPUSES.KHOURIBGA;
    const khouribgaCampus = {
      id: khouribgaCampusId,
      ...MOROCCO_CAMPUS_INFO[khouribgaCampusId]
    };
    
    console.log('Loading students from Khouribga campus (ID: 16)');
    
    // Get students from Khouribga campus with pagination
    let allStudents = [];
    let page = 1;
    let hasMorePages = true;
    
    while (hasMorePages) {
      const endpoint = `/v2/campus/${khouribgaCampusId}/users?filter[pool_month]=january,february,march,april,may,june,july,august,september,october,november,december&filter[pool_year]=2024,2025&page[size]=100&page[number]=${page}`;
      
      console.log(`Loading page ${page} from Khouribga campus...`);
      const students = await makeAPIRequest(endpoint, userSession.accessToken);
      
      allStudents = allStudents.concat(students);
      
      // Check if there are more pages (if we got less than 100 students, we're done)
      hasMorePages = students.length === 100;
      page++;
      
      // Add delay between pages to avoid rate limiting
      if (hasMorePages) {
        await delay(500); // Wait 0.5 seconds between pages
      }
    }
    
    console.log(`Total students loaded: ${allStudents.length}`);
    
    // Filter students who are currently in piscine
    const piscineStudents = allStudents.filter(student => 
      student.pool_month && student.pool_year && 
      (student.pool_year === '2024' || student.pool_year === '2025')
    );
    
    // Sort students alphabetically by login
    piscineStudents.sort((a, b) => a.login.localeCompare(b.login));
    
    res.render('index', { 
      students: piscineStudents, 
      error: null,
      campus: khouribgaCampus,
      user: userSession.user,
      sessionId: sessionId
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.render('index', { 
      students: null, 
      error: error.message,
      campus: null,
      user: userSession.user,
      sessionId: sessionId
    });
  }
});

app.get('/student/:id', async (req, res) => {
  const sessionId = req.query.session;
  const userSession = sessionId ? sessions.get(sessionId) : null;
  
  if (!userSession) {
    return res.render('student', { 
      student: null, 
      error: 'Please login first to view student details',
      user: null,
      sessionId: null
    });
  }
  
  try {
    const studentId = req.params.id;
    const student = await makeAPIRequest(`/v2/users/${studentId}`, userSession.accessToken);
    
    res.render('student', { 
      student, 
      error: null,
      user: userSession.user,
      sessionId: sessionId
    });
  } catch (error) {
    console.error('Error fetching student details:', error);
    res.render('student', { 
      student: null, 
      error: error.message,
      user: userSession.user,
      sessionId: sessionId
    });
  }
});

// Get all students with filters
app.get('/all-students', async (req, res) => {
  const sessionId = req.query.session;
  const userSession = sessionId ? sessions.get(sessionId) : null;
  
  if (!userSession) {
    return res.render('students-list', { 
      students: null, 
      campuses: null,
      error: 'Please login first to view students',
      user: null,
      sessionId: null,
      filters: {}
    });
  }
  
  try {
    // Get filters from query parameters
    const filters = {
      campus: req.query.campus || '',
      type: req.query.type || 'all', // 'all', 'students', 'poolers'
      poolYear: req.query.poolYear || '',
      poolMonth: req.query.poolMonth || '',
      search: req.query.search || '',
      initialLoad: req.query.initialLoad !== 'false' // Default to true for first load
    };
    
    // Get Morocco campuses for dropdown (using static data)
    let campuses = [];
    if (!filters.campus || filters.campus === 'all-morocco') {
      campuses = Object.entries(MOROCCO_CAMPUS_INFO).map(([id, info]) => ({
        id: parseInt(id),
        name: info.name,
        city: info.city,
        country: info.country
      }));
      campuses.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    let students = [];
    
    if (filters.campus === 'all-morocco') {
      // Get students from all Moroccan campuses
      console.log('Loading students from all Moroccan campuses...');
      
      const moroccanCampusIds = Object.values(MOROCCO_CAMPUSES);
      let totalLoaded = 0;
      const maxInitialLoad = 150;
      
      for (const campusId of moroccanCampusIds) {
        if (filters.initialLoad && totalLoaded >= maxInitialLoad) {
          break; // Stop loading if we have enough for initial display
        }
        
        try {
          // Use static campus info to avoid extra API calls
          const campus = MOROCCO_CAMPUS_INFO[campusId];
          
          // For initial load, limit to fewer pages per campus
          const maxPages = filters.initialLoad ? 2 : 999;
          let page = 1;
          let hasMorePages = true;
          
          while (hasMorePages && page <= maxPages) {
            if (filters.initialLoad && totalLoaded >= maxInitialLoad) {
              break;
            }
            
            let endpoint = `/v2/campus/${campusId}/users?page[size]=100&page[number]=${page}`;
            
            // Add pool filters if specified
            if (filters.type === 'poolers' && filters.poolYear) {
              endpoint += `&filter[pool_year]=${filters.poolYear}`;
              if (filters.poolMonth) {
                endpoint += `&filter[pool_month]=${filters.poolMonth}`;
              }
            }
            
            console.log(`Loading page ${page} from ${campus.name} (ID: ${campusId})...`);
            const pageStudents = await makeAPIRequest(endpoint, userSession.accessToken);
            
            // Add campus info to each student for display purposes
            const studentsWithCampus = pageStudents.map(student => ({
              ...student,
              campus_info: { name: campus.name, city: campus.city }
            }));
            
            students = students.concat(studentsWithCampus);
            totalLoaded += pageStudents.length;
            
            // Check if there are more pages
            hasMorePages = pageStudents.length === 100;
            page++;
            
            // Add delay between pages to avoid rate limiting
            if (hasMorePages && page <= maxPages) {
              await delay(300); // Shorter delay for initial load
            }
          }
          
          console.log(`Loaded ${totalLoaded} students so far...`);
          
          // Add delay between campus requests
          if (moroccanCampusIds.indexOf(campusId) < moroccanCampusIds.length - 1) {
            await delay(500);
          }
        } catch (error) {
          console.error(`Error loading students from campus ID ${campusId}:`, error.message);
          // Continue with other campuses even if one fails
        }
      }
      
      // Filter based on type
      if (filters.type === 'poolers') {
        students = students.filter(student => student.pool_month && student.pool_year);
      } else if (filters.type === 'students') {
        students = students.filter(student => !student.pool_month || !student.pool_year);
      }
      
      // Filter by pool year and month if specified
      if (filters.poolYear && filters.poolYear !== 'all' && filters.type !== 'students') {
        students = students.filter(student => student.pool_year === filters.poolYear);
      }
      if (filters.poolMonth && filters.poolMonth !== 'all' && filters.type !== 'students') {
        students = students.filter(student => student.pool_month && student.pool_month.toLowerCase() === filters.poolMonth.toLowerCase());
      }
      
      // Filter by search term if specified
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        students = students.filter(student => 
          student.login.toLowerCase().includes(searchTerm) ||
          (student.displayname && student.displayname.toLowerCase().includes(searchTerm)) ||
          (student.first_name && student.first_name.toLowerCase().includes(searchTerm)) ||
          (student.last_name && student.last_name.toLowerCase().includes(searchTerm))
        );
      }
      
      // Sort students alphabetically by login
      students.sort((a, b) => a.login.localeCompare(b.login));
      
      console.log(`Total students loaded: ${students.length}`);
    } else if (filters.campus) {
      // Get students from specific campus
      const campusId = CAMPUS_FILTER_MAP[filters.campus];
      if (!campusId) {
        throw new Error(`Invalid campus filter: ${filters.campus}`);
      }
      
      const maxInitialLoad = 150;
      let totalLoaded = 0;
      let page = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        if (filters.initialLoad && totalLoaded >= maxInitialLoad) {
          break;
        }
        
        let endpoint = `/v2/campus/${campusId}/users?page[size]=100&page[number]=${page}`;
        
        // Add pool filters if specified
        if (filters.type === 'poolers' && filters.poolYear) {
          endpoint += `&filter[pool_year]=${filters.poolYear}`;
          if (filters.poolMonth) {
            endpoint += `&filter[pool_month]=${filters.poolMonth}`;
          }
        }
        
        console.log(`Loading page ${page} from campus ID ${campusId}...`);
        const pageStudents = await makeAPIRequest(endpoint, userSession.accessToken);
        
        students = students.concat(pageStudents);
        totalLoaded += pageStudents.length;
        
        // Check if there are more pages
        hasMorePages = pageStudents.length === 100;
        page++;
        
        // Add delay between pages to avoid rate limiting
        if (hasMorePages && (!filters.initialLoad || totalLoaded < maxInitialLoad)) {
          await delay(300);
        }
      }
      
      // Filter based on type
      if (filters.type === 'poolers') {
        students = students.filter(student => student.pool_month && student.pool_year);
      } else if (filters.type === 'students') {
        students = students.filter(student => !student.pool_month || !student.pool_year);
      }
      
      // Filter by pool year and month if specified
      if (filters.poolYear && filters.type !== 'students') {
        students = students.filter(student => student.pool_year === filters.poolYear);
      }
      if (filters.poolMonth && filters.type !== 'students') {
        students = students.filter(student => student.pool_month && student.pool_month.toLowerCase() === filters.poolMonth.toLowerCase());
      }
      
      // Sort students alphabetically by login
      students.sort((a, b) => a.login.localeCompare(b.login));
      
      console.log(`Loaded ${students.length} students from campus ${campusId}`);
    }
    
    res.render('students-list', { 
      students, 
      campuses,
      error: null,
      user: userSession.user,
      sessionId: sessionId,
      filters
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.render('students-list', { 
      students: null, 
      campuses: null,
      error: error.message,
      user: userSession.user,
      sessionId: sessionId,
      filters: {}
    });
  }
});

// API endpoint for loading more students (for infinite scroll)
app.get('/api/students/more', async (req, res) => {
  const sessionId = req.query.session;
  const userSession = sessionId ? sessions.get(sessionId) : null;
  
  if (!userSession) {
    return res.json({ error: 'Please login first' });
  }
  
  try {
    const filters = {
      campus: req.query.campus || '',
      type: req.query.type || 'all',
      poolYear: req.query.poolYear || '',
      poolMonth: req.query.poolMonth || '',
      search: req.query.search || '',
      offset: parseInt(req.query.offset) || 0,
      limit: parseInt(req.query.limit) || 10000 // Set high limit to load all available students
    };
    
    let students = [];
    console.log(`Loading students: offset=${filters.offset}, limit=${filters.limit}`);
    
    if (filters.campus === 'all-morocco') {
      // Load ALL students from all Moroccan campuses
      const moroccanCampusIds = Object.values(MOROCCO_CAMPUSES);
      
      for (const campusId of moroccanCampusIds) {
        try {
          const campus = MOROCCO_CAMPUS_INFO[campusId];
          
          // Load all pages for this campus
          let page = 1;
          let hasMorePages = true;
          
          while (hasMorePages) {
            let endpoint = `/v2/campus/${campusId}/users?page[size]=100&page[number]=${page}`;
            
            if (filters.type === 'poolers' && filters.poolYear) {
              endpoint += `&filter[pool_year]=${filters.poolYear}`;
              if (filters.poolMonth) {
                endpoint += `&filter[pool_month]=${filters.poolMonth}`;
              }
            }
            
            const pageStudents = await makeAPIRequest(endpoint, userSession.accessToken);
            if (pageStudents.length === 0) break;
            
            const studentsWithCampus = pageStudents.map(student => ({
              ...student,
              campus_info: { name: campus.name, city: campus.city }
            }));
            
            students = students.concat(studentsWithCampus);
            
            hasMorePages = pageStudents.length === 100;
            page++;
            
            // Add delay between pages to avoid rate limiting
            await delay(200);
          }
          
          // Add delay between campuses
          await delay(300);
        } catch (error) {
          console.error(`Error loading students from campus ID ${campusId}:`, error.message);
        }
      }
      
    } else if (filters.campus) {
      // Load ALL students from specific campus
      const campusId = CAMPUS_FILTER_MAP[filters.campus] || parseInt(filters.campus);
      let page = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        let endpoint = `/v2/campus/${campusId}/users?page[size]=100&page[number]=${page}`;
        
        if (filters.type === 'poolers' && filters.poolYear) {
          endpoint += `&filter[pool_year]=${filters.poolYear}`;
          if (filters.poolMonth) {
            endpoint += `&filter[pool_month]=${filters.poolMonth}`;
          }
        }
        
        const pageStudents = await makeAPIRequest(endpoint, userSession.accessToken);
        if (pageStudents.length === 0) break;
        
        students = students.concat(pageStudents);
        
        hasMorePages = pageStudents.length === 100;
        page++;
        
        // Add delay between pages to avoid rate limiting
        await delay(200);
      }
    }
    
    // Apply filters
    if (filters.type === 'poolers') {
      students = students.filter(student => student.pool_month && student.pool_year);
    } else if (filters.type === 'students') {
      students = students.filter(student => !student.pool_month || !student.pool_year);
    }
    
    if (filters.poolYear && filters.poolYear !== 'all' && filters.type !== 'students') {
      students = students.filter(student => student.pool_year === filters.poolYear);
    }
    if (filters.poolMonth && filters.poolMonth !== 'all' && filters.type !== 'students') {
      students = students.filter(student => student.pool_month && student.pool_month.toLowerCase() === filters.poolMonth.toLowerCase());
    }
    
    // Apply search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      students = students.filter(student => 
        (student.login && student.login.toLowerCase().includes(searchTerm)) ||
        (student.displayname && student.displayname.toLowerCase().includes(searchTerm)) ||
        (student.first_name && student.first_name.toLowerCase().includes(searchTerm)) ||
        (student.last_name && student.last_name.toLowerCase().includes(searchTerm))
      );
    }
    
    // Sort students alphabetically by login
    students.sort((a, b) => a.login.localeCompare(b.login));
    
    // Apply offset for pagination (but load all available after offset)
    const filteredStudents = students.slice(filters.offset);
    
    res.json({
      students: filteredStudents,
      hasMore: false, // No more pages since we're loading all available
      nextOffset: filters.offset + filteredStudents.length,
      total: students.length
    });
    
  } catch (error) {
    console.error('Error loading students:', error);
    res.json({ error: error.message });
  }
});

// Debug route to see all campuses
app.get('/debug/campuses', async (req, res) => {
  const sessionId = req.query.session;
  const userSession = sessionId ? sessions.get(sessionId) : null;
  
  if (!userSession) {
    return res.json({ error: 'Please login first' });
  }
  
  try {
    const campuses = await makeAPIRequest('/v2/campus', userSession.accessToken);
    
    // Sort campuses by name for easier browsing
    campuses.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({
      total: campuses.length,
      campuses: campuses.map(campus => ({
        id: campus.id,
        name: campus.name,
        city: campus.city,
        country: campus.country,
        full_name: `${campus.name} (${campus.city}, ${campus.country})`
      }))
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Morocco campuses info route
app.get('/debug/morocco-campuses', async (req, res) => {
  const sessionId = req.query.session;
  const userSession = sessionId ? sessions.get(sessionId) : null;
  
  if (!userSession) {
    return res.json({ error: 'Please login first' });
  }
  
  try {
    const moroccoCampuses = {};
    
    for (const [name, id] of Object.entries(MOROCCO_CAMPUSES)) {
      const campus = await makeAPIRequest(`/v2/campus/${id}`, userSession.accessToken);
      moroccoCampuses[name] = {
        id: campus.id,
        name: campus.name,
        city: campus.city,
        country: campus.country,
        timezone: campus.time_zone,
        website: campus.website,
        address: campus.address,
        active: campus.active
      };
    }
    
    res.json({
      morocco_campuses: moroccoCampuses,
      total: Object.keys(moroccoCampuses).length
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
