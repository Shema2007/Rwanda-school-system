# Rwanda-school-system

## Demo payment receipts

After confirming a simulated payment, the finance form displays a demo receipt
with optional SMS, email, and WhatsApp actions. These actions open the parent's
messaging app with a pre-filled message; the parent must review and send it.
The payer can enter any positive whole-number amount in RWF instead of choosing
from preset values. This prototype does not process payments or automatically
deliver messages.

## E-report cards

The report preview and printout use the selected learner's saved CBC assessment
rows from this browser. Each learning area shows its latest saved scores; the
term average is calculated from those areas, and marks are tagged with the
selected academic term. Learners without saved marks for that term are shown an
empty-state message rather than another learner's scores.
The print layout is formatted for A4 and includes the selected school term,
preparation date, and signature lines. It is explicitly marked as a local
school report, not an REB-verified record. The demo QR and fake verification
code have been removed.

An official REB connection cannot be enabled until the school supplies the
authorized REB API documentation and service access details. No REB data is
currently sent or verified.

## Learner enrollment

The enrollment dialog saves learner name, class, optional guardian phone, and
an automatically generated admission number in this browser. Enrolled learners
are available in CBC marks, attendance, and report-card selection lists. The
dialog also shows a searchable local roster. This demo does not connect to a
central school database, so its saved roster is limited to this browser.

## Circular samples

The directives page filters fictional sample circulars by NESA, REB, and
MINEDUC, and requires opening a preview before downloading. The preview and
generated A4 PDF are marked as fictional and not official government documents.
No live institutional feed, official circular, or verification service is
connected.
