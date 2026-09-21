# Supabase Edge Functions

## Available Functions

### `verify-otp`
Verify OTP code and create team captain session token.

**Endpoint:** `https://[project-ref].supabase.co/functions/v1/verify-otp`

**Method:** `POST`

**Request Body:**
```json
{
  "phone": "+998901234567",
  "code": "1234"
}
```

**Security Checks:**
1. Verify OTP code exists in `otp_codes` table
2. Check code not already used (`is_used=false`)
3. Check code not expired (`expires_at > now`)
4. Find team where phone is `captain_phone` (manager role check)
5. If captain: create `team_sessions` token (24h expiry)
6. Mark OTP as used

**Response (200) - Captain:**
```json
{
  "success": true,
  "role": "captain",
  "sessionToken": "uuid-token",
  "expiresAt": "2026-09-23T00:00:00.000Z",
  "team": {
    "id": "uuid",
    "name": "Team Name",
    "logo_url": "https://...",
    "organization_id": 123
  },
  "canRequestTransfers": true,
  "message": "OTP verified. Session token created."
}
```

**Response (200) - Player (not captain):**
```json
{
  "success": true,
  "role": "player",
  "message": "OTP verified, but you are not a team captain",
  "canRequestTransfers": false
}
```

**Error Responses:**
- 400: Missing fields or invalid phone format
- 401: Invalid, used, or expired OTP code
- 500: Database or session creation error

---

### `request-transfer`
Create team-initiated transfer request with security validation.

**Endpoint:** `https://[project-ref].supabase.co/functions/v1/request-transfer`

**Method:** `POST`

**Authentication:** Bearer token (from `team_sessions` after OTP verification)

**Headers:**
```
Authorization: Bearer <session-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "player_id": "uuid",
  "new_team_id": "uuid",
  "reason": "string"
}
```

**Security Checks:**
1. Verify Bearer token exists and not expired (from `team_sessions`)
2. Verify `new_team_id` matches session's `team_id`
3. Double-check session phone matches team captain phone
4. Verify player is currently in another team
5. Verify transfer window is open for the organization
6. Check no existing pending transfer for this player

**Response (201):**
```json
{
  "success": true,
  "transfer": { ... },
  "message": "Transfer request created. Player will be notified via bot."
}
```

**Error Responses:**
- 400: Missing fields, player not in team, or player already in requesting team
- 401: Missing/invalid/expired Bearer token
- 403: Token belongs to different team, transfer window closed, or session phone mismatch
- 404: Team, player, or organization not found
- 409: Player already has pending transfer
- 500: Internal server error

---

## Deployment

### Prerequisites
- Supabase CLI installed: `npm install -g supabase`
- Project linked: `supabase link --project-ref [your-project-ref]`

### Deploy Single Function
```bash
supabase functions deploy request-transfer
```

### Deploy All Functions
```bash
supabase functions deploy
```

### Set Environment Variables
```bash
supabase secrets set SUPABASE_URL=https://[project-ref].supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Test Locally
```bash
supabase functions serve request-transfer
```

Then test with:
```bash
curl -X POST http://localhost:54321/functions/v1/request-transfer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-session-token>" \
  -d '{
    "player_id": "...",
    "new_team_id": "...",
    "reason": "Great player"
  }'
```

---

## Integration

### Step 1: OTP Verification (Backend/API)
After successful OTP verification, create a session token:

```typescript
// In your verifyOTP endpoint/function:
const sessionToken = crypto.randomUUID(); // or crypto.randomBytes(32).toString('hex')
const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

await supabase.from('team_sessions').insert({
  token: sessionToken,
  phone: verifiedPhone,
  team_id: teamId,
  expires_at: expiresAt.toISOString()
});

// Return token to client
return { success: true, sessionToken, expiresAt };
```

### Step 2: Store Token (Client)
```typescript
// After OTP verification success:
localStorage.setItem('teamSessionToken', sessionToken);
localStorage.setItem('teamSessionExpiry', expiresAt);
```

### Step 3: Use Token in Requests (Client)
```typescript
const sessionToken = localStorage.getItem('teamSessionToken');

const response = await supabase.functions.invoke('request-transfer', {
  headers: {
    Authorization: `Bearer ${sessionToken}`,
  },
  body: {
    player_id: selectedPlayer.id,
    new_team_id: currentTeam.id,
    reason: transferReason,
  }
});

if (response.error) {
  // Handle error (e.g., expired token -> re-verify OTP)
  console.error('Transfer request failed:', response.error);
} else {
  console.log('Transfer requested:', response.data);
}
```

---

## Bot Integration

The bot listens to Supabase Realtime for new transfer records:

```javascript
supabase
  .channel('transfers-insert')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'transfers'
  }, async (payload) => {
    // Send notification to player via Telegram
    // with inline buttons: Accept / Reject
  })
  .subscribe();
```
