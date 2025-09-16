# MFFL Fantasy Football League Website

A comprehensive fantasy football league management system with web and mobile applications.

## Features

- 🏈 **Live Fantasy Data** - Real-time scores, matchups, and standings via Sleeper API
- 📱 **Cross-Platform Mobile App** - React Native/Expo app for iOS and Android
- 🏆 **League Management** - Announcements, documents, and commissioner tools
- 📊 **NFL Game Tracking** - Live scores and game information
- 💰 **Spiff Bank System** - Track league member balances
- 📸 **Cam's Corner** - Special content management area
- 🔐 **Role-Based Access** - Different permissions for users, commissioners, and special roles

## Tech Stack

### Backend
- **Node.js** with Express
- **File-based JSON storage** for league data
- **Sleeper API integration** for live fantasy data
- **JWT & Session authentication**
- **Multer** for file uploads

### Web Frontend
- **Traditional HTML/CSS/JavaScript**
- **Responsive design** with mobile optimization
- **Real-time data updates**

### Mobile App
- **React Native** with Expo
- **TypeScript** for type safety
- **TanStack Query** for data management
- **Expo Router** for navigation

## Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Expo CLI (for mobile development)

### Server Setup

1. Clone the repository
```bash
git clone https://github.com/GeorgeL101/MFFL-Website.git
cd MFFL-Website
```

2. Install dependencies
```bash
npm install
```

3. Create `.env` file with your configuration:
```env
PORT=3000
SITE_PASSWORD=your-site-password
COMMISH_PASSWORD=your-commissioner-password
CAM_PASSWORD=your-cam-password
SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret
SLEEPER_LEAGUE_ID=your-sleeper-league-id
```

4. Start the server
```bash
node server.js
```

The web application will be available at `http://localhost:3000`

### Mobile App Setup

1. Navigate to mobile directory
```bash
cd mobile
```

2. Install dependencies
```bash
npm install
```

3. Create mobile `.env` file:
```env
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

4. Start Expo development server
```bash
npm start
```

## Project Structure

```
├── server.js              # Main Express server
├── package.json           # Server dependencies
├── data/                  # JSON data storage
│   ├── mffl.json         # League announcements and roster
│   ├── suggestions.json   # User suggestions
│   ├── spiffs.json       # Spiff bank balances
│   └── cams.json         # Cam's Corner content
├── public/               # Web frontend
│   ├── index.html        # Main dashboard
│   ├── teams.html        # Team roster view
│   ├── bracket.html      # Playoff bracket
│   └── uploads/          # User uploaded files
└── mobile/               # React Native mobile app
    ├── app/              # Expo Router pages
    ├── components/       # Reusable components
    ├── lib/              # API utilities
    └── constants/        # App configuration
```

## API Endpoints

### Authentication
- `POST /login` - Web login
- `POST /api/mobile/login` - Mobile login (returns JWT)
- `POST /commish-login` - Commissioner access
- `POST /cam-login` - Cam access

### Fantasy Data
- `GET /api/league` - League info and announcements
- `GET /api/sleeper/rosters` - Team rosters
- `GET /api/sleeper/matchups` - Weekly matchups
- `GET /api/sleeper/transactions` - Waiver/trade activity
- `GET /api/sleeper/bracket` - Playoff bracket

### Content Management
- `GET /api/announcements` - League announcements
- `POST /api/announcements` - Create announcement (commissioners)
- `GET /api/docs` - Document management
- `GET /api/nfl/games` - Live NFL scores

## Development

### Running in Development Mode

**Server:**
```bash
node server.js
```

**Mobile App:**
```bash
cd mobile
npm start
```

### Environment Variables

See `.env.example` files for required configuration variables.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and intended for league use only.

## Support

For questions or issues, please contact the league administrator.
