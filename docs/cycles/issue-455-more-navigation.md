# Issue455 Item3 - More Navigation

Local candidate from verified main6247e0fe,not released. Only owned467 proof
carried deliberately.455items1+2 remain live;items4+ and456 are not bundled.

## Trace

Native index -> app.js groups/navigation/link -> existing fixed navigation.js
navHref/shellHref/href -> Today/Email native routes or seven classic workspace
deep links. Static labels only;no source field/value/record transformations.
More is the sole native entry for Leads,Deals,Buyers,Calendar,Pipeline,Approvals,
Settings. Duplicate topbar/account Settings links removed. Classic renderers,
record_ref precedence,admin role checks,same signed session and actual tools
are unchanged;this does not authorize a native Deals screen.

Existing components drawer/button/icon/bindDialog own markup,one44px lucide X,
Escape and focus restoration. Mobile Navigation closes before More opens;no
nested modal. More-only backdrop/Tab-boundary handling leaves other dialogs
untouched. Link closes before ordinary GET navigation;Back returns to the prior
screen. clearPrivate replaces the whole host and removes More on401;non-admin
never receives native business reads. More open/close does not fetch or write.
No storage,auth,API,provider,CSP,canonical facts/POF/value/readiness or runtime
mail changes. CSS14/app11 invalidate only changed native assets;other keys and
assistant tags retained. navigation.js comment alone updates superseded wording;
runtime nav3 identical. Full-height mobile menu remains455item7,not bundled.

## Verification

New workspace-more-navigation test:Today+Email1366/400/412 and1038x503;one
visible More/exactsevenfixedlinks/plainlabels/noClassicview,icons/44px/oneX,
X/Escape/backdrop/keyboard cycle/visible focus return/no nested dialogs,source
preservation/no extra reads,actual classic Settings destination,401/private DOM
clear/nonadmin no-read,fixture unchanged/zero external/writes/pageerrors.

Existing shell test owner-intended assertions change from six labeled Classic
links to Today/Email+More/plainseven destinations. The old note-clipping check
becomes all-primary-controls-in-bounds. Existing Email/Today->classic tool
clickthroughs now use More;all six destinations still tested with real Back.
Navigation journey's two native Deals entry steps now use More;ALL later source
mail/exactrecord/Back/locked/nonadmin/no-write assertions retained. No test deleted
or safety assertion weakened. Existing Today/mailbox tests unchanged and PASS.

First focused new test exposed keyboard Tab leaving the new modal. First fix
adds menu-only boundary wrap;original focus assertion retained. A subsequent
shell fixture count used getByRole on a hidden sidebar;DOM locator now counts
both responsive copies,while newtest separately asserts one visible entry.
That was scaffolding correction,not a product regression or weakened invariant.
Focused five-file set PASS after fixes. Earlier lost process output was not
treated as evidence;a bounded focused repeat captured all five terminal results.

Serialized exact-product synthetic before/after audit against6247e0fe PASS:
Today FCP130.8/101.5/124.7ms and Email320.5/525.2/397.5ms at1366/400/412;
before Today350.2/134.5/143.4 and Email214.4/123.6/127.5ms. Every FCP<2s,
zero pageerrors/overflow. LH13.5 after performance99/96 and accessibility100/100
on BOTH Today and Email;null runtimeerrors/empty auditerror arrays. This is
synthetic,NOTlive timing. Content masked BEFOREdisk;static More dialog crops
and full before/after screenshots inspected,retained with numeric proof under
docs/screens/2026-10-28-more-navigation-candidate. No overlapping local tests
during serialized Lighthouse measurements. Full273/self-review/release remain
pending. No production PIN/key/settings/privatefile/business actions or auth
transfer used. Main/live stays verified467 until every release gate passes.
