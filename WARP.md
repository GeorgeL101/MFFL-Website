# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Architecture Overview

This is a full-stack fantasy football league management system with:
- **Backend**: Node.js/Express server with file-based JSON storage
- **Frontend**: Traditional HTML/CSS/JS web application
- **Mobile**: React Native/Expo cross-platform app
- **Data Sources**: Sleeper API integration for live fantasy data

### Key Components

**Server (server.js)**
- Express application with session-based authentication
- File-based JSON storage in `/data` directory
- REST API endpoints for mobile app consumption
- Sleeper API integration with caching
- Multi-role authentication (users, commissioners, Cam)
- File upload handling with Multer

**Web Frontend (/public)**
- Traditional multi-page application
- Static HTML files with embedded JavaScript
- Real-time NFL game data and fantasy matchups
- Admin panels for commissioners
- Responsive design with mobile optimization

**Mobile App (/mobile)**
- React Native/Expo application
- TanStack Query for data fetching
- JWT authentication with secure storage
- File-based routing with expo-router
- Cross-platform iOS/Android support

## Development Commands

### Server Development
```powershell
# Install dependencies
npm install

# Start development server
node server.js

# Server runs on http://localhost:3000 by default
```

### Mobile Development
```powershell
# Navigate to mobile directory
cd mobile

# Install dependencies
npm install

# Start Expo development server
npm start
# or
npx expo start

# Run on specific platforms
npm run android
npm run ios
npm run web

# Lint mobile code
npm run lint
```

### Environment Setup
Create `.env` files for configuration:

**Root .env**:
```
PORT=3000
SITE_PASSWORD=your-site-password
COMMISH_PASSWORD=your-commissioner-password
CAM_PASSWORD=your-cam-password
SESSION_SECRET=your-session-secret
JWT_SECRET=your-jwt-secret
SLEEPER_LEAGUE_ID=your-sleeper-league-id
```

**Mobile .env**:
```
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

## Data Management

### File Storage Structure
- `/data/mffl.json` - League announcements and roster data
- `/data/suggestions.json` - User suggestions for commissioners
- `/data/spiffs.json` - Spiff bank balances
- `/data/cams.json` - Cam's Corner content blocks
- `/data/docs.json` - Document metadata
- `/public/uploads/` - Uploaded files (images, documents)

### Sleeper API Integration
The server integrates with Sleeper API for live data:
- League information and rosters
- Weekly matchups and scoring
- Transaction history
- Player database
- Playoff brackets

Data is cached in-memory with configurable TTL (5 minutes for most endpoints, 24 hours for player data).

## Authentication & Authorization

### Web Authentication
- Session-based authentication using `express-session`
- Three authorization levels:
  - **Users**: Basic site access
  - **Commissioners**: Admin functions (announcements, docs)
  - **Cam**: Special content area management

### Mobile Authentication
- JWT-based authentication
- Tokens stored securely using `expo-secure-store`
- Bearer token sent in Authorization header

### Password Management
- Uses crypto.timingSafeEqual for constant-time password comparison
- Rate limiting on login endpoints (20 attempts per 15 minutes)
- Separate password roles for different access levels

## API Endpoints

### Authentication
- `POST /login` - Web login
- `POST /api/mobile/login` - Mobile login (returns JWT)
- `POST /commish-login` - Commissioner elevation
- `POST /cam-login` - Cam access

### Fantasy Data
- `GET /api/league` - Combined local + Sleeper league data
- `GET /api/sleeper/rosters` - Team roster list
- `GET /api/sleeper/roster/:id` - Detailed roster with player names
- `GET /api/sleeper/matchups` - Weekly fantasy matchups
- `GET /api/sleeper/transactions` - Waiver/trade activity
- `GET /api/sleeper/bracket` - Playoff bracket

### Content Management
- `GET /api/announcements` - League announcements
- `POST /api/announcements` - Create announcement (commissioners)
- `DELETE /api/announcements/:id` - Delete announcement (commissioners)
- `GET /api/docs` - Document list
- `POST /api/docs` - Upload document (commissioners)

### Special Features
- `GET /api/nfl/games` - Live NFL game scores (ESPN proxy)
- `GET /api/spiffs` - Spiff bank balances
- `PUT /api/spiffs` - Update spiff banks (commissioners)
- `GET /api/cams` - Cam's Corner content blocks
- `POST /api/cams/blocks` - Create Cam content

## Mobile App Architecture

### Navigation Structure
- File-based routing using expo-router
- Tab navigation for main sections
- Modal presentations for detail views

### State Management
- TanStack Query for server state
- React Context for authentication
- Expo SecureStore for token persistence

### Key Dependencies
- `expo-router` - File-based navigation
- `@tanstack/react-query` - Data fetching and caching
- `expo-secure-store` - Secure token storage
- `expo-image-picker` - Camera/gallery access

## Development Guidelines

### Adding New API Endpoints
1. Add route handler in `server.js`
2. Apply appropriate authentication middleware
3. Update mobile API client if needed
4. Consider caching for performance

### File Upload Handling
- Use Multer for multipart form data
- Files stored in `/public/uploads/[category]/`
- Implement file size and type restrictions
- Clean up files when records are deleted

### Sleeper API Usage
- Always use the caching wrapper functions
- Handle API failures gracefully with fallbacks
- Respect rate limits (though Sleeper is generous)
- Cache player data for 24 hours minimum

### Mobile Development
- Test on both iOS and Android simulators
- Use TypeScript for type safety
- Follow Expo development guidelines
- Handle offline scenarios gracefully

## Production Considerations

### Security
- Use environment variables for all secrets
- Implement HTTPS in production
- Consider more robust session storage than memory
- Add CSRF protection for web forms
- Validate and sanitize all user inputs

### Performance
- Enable HTTP caching for static assets
- Consider Redis for session storage
- Implement database for better data persistence
- Add compression middleware
- Monitor API rate limits

### Deployment
- Set NODE_ENV=production
- Use process manager like PM2
- Configure reverse proxy (nginx)
- Set up SSL certificates
- Monitor server logs and errors