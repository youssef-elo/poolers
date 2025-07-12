# 42 Khouribga Piscine Students Dashboard

A beautiful web application to display student information from the 42 School API, specifically for the Khouribga campus during the piscine period.

## Features

- 🏊‍♂️ **Piscine Students**: View all students currently in the piscine at Khouribga campus
- 📊 **Student Details**: Detailed view of each student's profile, projects, and achievements
- 🎨 **Modern UI**: Beautiful, responsive design with Bootstrap 5
- 🔐 **API Authentication**: Secure authentication with 42 School API using OAuth 2.0
- 📱 **Mobile Friendly**: Responsive design that works on all devices

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Valid 42 School API credentials

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd poolers
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env` if needed
   - The API credentials are already configured in `.env`

4. Start the application:
```bash
npm start
```

5. Open your browser and go to: `http://localhost:3000`

## Usage

1. **Home Page**: Visit the main page to see an overview
2. **Load Students**: Click the "Load Students" button to fetch all piscine students from Khouribga campus
3. **View Details**: Click on any student card to see their detailed profile
4. **Student Profile**: View comprehensive information including:
   - Personal information
   - Academic progress and level
   - Campus information
   - Projects and grades
   - Achievements and badges

## API Integration

The application uses the 42 School API with the following endpoints:

- `/v2/campus` - Get campus information
- `/v2/campus/{id}/users` - Get students from a specific campus
- `/v2/users/{id}` - Get detailed student information

Authentication is handled using OAuth 2.0 client credentials flow.

## Development

For development with auto-reload:
```bash
npm run dev
```

## Technology Stack

- **Backend**: Node.js with Express
- **Frontend**: EJS templates with Bootstrap 5
- **HTTP Client**: Axios for API requests
- **Styling**: Bootstrap 5 + Font Awesome icons
- **Environment**: dotenv for configuration

## Project Structure

```
poolers/
├── server.js          # Main server file
├── package.json       # Dependencies and scripts
├── .env              # Environment variables (API credentials)
├── .gitignore        # Git ignore file
├── views/            # EJS templates
│   ├── index.ejs     # Main page
│   └── student.ejs   # Student detail page
└── README.md         # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - feel free to use this project for your own purposes.

## Support

If you encounter any issues or have questions, please open an issue in the repository.

---

Built with ❤️ for the 42 School community