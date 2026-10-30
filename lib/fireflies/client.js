'use strict';

const axios = require('axios');

const FIREFLIES_GRAPHQL = 'https://api.fireflies.ai/graphql';

const TRANSCRIPT_QUERY = `
query Transcript($transcriptId: String!) {
  transcript(id: $transcriptId) {
    id
    title
    date
    duration
    organizer_email
    participants
    transcript_url
    meeting_attendees {
      displayName
      email
    }
    summary {
      overview
      short_summary
      action_items
      shorthand_bullet
      keywords
    }
  }
}
`;

/**
 * @param {string} apiKey
 * @param {string} meetingId transcript/meeting id from webhook
 */
async function fetchTranscript(apiKey, meetingId) {
  const id = String(meetingId || '').trim();
  const key = String(apiKey || '').trim();
  if (!id) {
    const err = new Error('meeting_id saknas');
    err.code = 'FIREFLIES_BAD_REQUEST';
    throw err;
  }
  if (!key) {
    const err = new Error('FIREFLIES_API_KEY saknas');
    err.code = 'FIREFLIES_CONFIG';
    throw err;
  }

  const res = await axios.post(
    FIREFLIES_GRAPHQL,
    { query: TRANSCRIPT_QUERY, variables: { transcriptId: id } },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      timeout: 25000
    }
  );

  if (res.data && Array.isArray(res.data.errors) && res.data.errors.length) {
    const msg = res.data.errors.map((e) => e && e.message).filter(Boolean).join('; ');
    const err = new Error(msg || 'Fireflies GraphQL-fel');
    err.code = 'FIREFLIES_API';
    throw err;
  }

  const transcript = res.data && res.data.data && res.data.data.transcript;
  if (!transcript || !transcript.id) {
    const err = new Error('Fireflies hittade inte mötet');
    err.code = 'FIREFLIES_NOT_FOUND';
    throw err;
  }
  return transcript;
}

module.exports = {
  FIREFLIES_GRAPHQL,
  TRANSCRIPT_QUERY,
  fetchTranscript
};
