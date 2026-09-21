# Supabase Edge Functions

## Available Functions

### `request-transfer`
Create team-initiated transfer request with security validation.

**Endpoint:** `https://[project-ref].supabase.co/functions/v1/request-transfer`

**Method:** `POST`

**Request Body:**
```json
{
  "player_id": "uuid",
  "captain_phone": "+998901234567",
  "new_team_id": "uuid",
  "reason": "string"
}
```

**Security Checks:**
1. Verify captain phone matches requesting team's captain_phone
2. Verify player is currently in another team
3. Verify transfer window is open for the organization
4. Check no existing pending transfer for this player

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
- 403: Unauthorized (not captain) or transfer window closed
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
  -d '{
    "player_id": "...",
    "captain_phone": "+998901234567",
    "new_team_id": "...",
    "reason": "Great player"
  }'
```

---

## Integration

### From Client (React)
```typescript
const response = await supabase.functions.invoke('request-transfer', {
  body: {
    player_id: selectedPlayer.id,
    captain_phone: verifiedCaptainPhone, // From OTP verification
    new_team_id: currentTeam.id,
    reason: transferReason,
  }
});

if (response.error) {
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
