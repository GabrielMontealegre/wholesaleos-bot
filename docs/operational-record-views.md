# Operational record views

Pipeline, Outreach, Matching and Review now distinguish property records with
address proof from records needing address proof and records with conflicting
links. All records stay saved. The counters open the corresponding research list;
state, county and city filters apply before pagination. Lists are bounded to 50
records per page, with the full matching total displayed.

Address proof uses the existing structured-source marker and matching source text.
A normalized address copied into an old record does not supply proof. Generic
portals, venue/mailing addresses and OCR-review rows stay in research. Document
or property-specific source links are required; a list requires its exact row reference.
These rules describe display eligibility, not a source refresh or saved-data mutation.

Callability additionally requires a sourced owner phone supported by its evidence,
known identity, and no contact refusal or bank/government owner classification.
Wrong-number invalidations still come from the existing contact rule. Conflicting
property links cannot remain Call Today after read-time dossier correction.

Matching requires a property with proof, nonzero recorded ARV and offer, and an
approved/verified buyer with recorded provenance. This preliminary safety check does
not verify ARV or replace the strict comp grid or the later B-19 match engine.
No Send controls are rendered in Matching or Review. Unknown values are labeled.

This is the first ordered #269 slice. Remaining work includes Dashboard/Deal Finder
row navigation and count links; clickable research URLs and source facts in the
remaining detail surfaces; Daily Call Pipeline/Deal Finder filters; plain labels and
four-pill limits; and All States/Email loading behavior. #269 remains IN PROGRESS.
