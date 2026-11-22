'use strict';
function lead() {
  return {
    synthetic: true, id: 'synthetic-contact', address: '100 Test St, Example City, TX 75001', city: 'Example City', state: 'TX',
    source_url: 'https://county.example.gov/notices/SYNTHETIC.pdf', source_kind: 'official_public_record',
    source_structured_address_verified: true, source_proof_text: 'Property address: 100 Test St, Example City, TX 75001.',
    owner_record: { owner_name: 'Synthetic Owner' }, status: 'New Lead', phone: '5559999999',
    free_contact_routes: [{ route_kind: 'owner_phone', route_type: 'owner', value: '5550101234',
      source_kind: 'official_public_record', source_url: 'https://county.example.gov/property/SYNTHETIC',
      evidence_text: 'Owner of record phone: 5550101234' }]
  };
}
module.exports = { lead };
