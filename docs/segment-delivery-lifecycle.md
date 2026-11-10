# Segment delivery lifecycle

Delivery refreshes follow successful ingestion acknowledgments, including retries
and successful destinations of partially failed transport batches. Identity and
route events can request a flush; custom events keep normal analytics batching.
Refresh work is coalesced. There is no targeting polling timer.

The initial manifest still starts immediately. If ingestion completes before the
experience runtime loads, its refresh remains pending and is drained afterward.
Acknowledge-triggered refresh evaluates page-load candidates and applicable custom
events separately. Captured triggers are limited to the same page-view, current
visitor/session, at most 30 seconds old, with at most 20 pending event names.

Manifest responses must match the latest request generation and current site,
visitor, external identity, session and route. Superseded fetches are aborted;
context checks also reject late responses from transports that ignore cancellation.
Manual guide launches use equivalent context checks.

Queued ordinary widgets are selected from fresh authoritative manifests, never a
cached old payload appended to a new result. Event-triggered queued candidates
retain a bounded 30-second lease containing only originally eligible IDs. Before
mounting, the server revalidates them with their original trigger. A candidate is
consumed when displayed, and identity/session/route changes clear its trigger
context. A lease expiring while another experience is active intentionally drops
that old trigger; it does not poll or replay indefinitely.

Same-user route navigation and same-user session continuation preserve supported
active guide/survey journeys. Guide continuation is stored in sessionStorage under
separate site/user keys. Legacy unscoped guide state is not restored because it
cannot establish ownership. Server progress/history is preserved. First identify
can promote an anonymous guide's owned continuation into the identified scope.
Surveys resume from the existing server response after safe first-identify merging.

Reset/logout or an effective account switch invalidates in-flight requests, removes
old active/paused/queued presentation, recreates checklist presentation, and clears
pending old triggers/launches. Account switching rotates anonymous/session IDs.
Callbacks from an invalidated runtime cannot record new impressions or actions;
requests already sent retain the identity snapshot that owned the experience.
Different users' stored guide progress remains separate rather than overwritten.

The backend parameter `trackedUserId` continues to mean the external customer user
ID. No new segment evaluator, public private-targeting fields, or permanent
client-side audience-membership cache was introduced.
