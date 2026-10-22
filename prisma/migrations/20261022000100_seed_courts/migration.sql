-- Shared reference list of courts (officeId NULL = visible to every office).
-- Supreme Court, the three Karnataka High Court benches, the Bengaluru City Civil Court and one principal
-- district court per other Karnataka district (Bengaluru Urban is served by the City Civil Court).
-- Offices can add their own courts; cases can also name a court in free text (Case.courtName).
-- Re-running is harmless: rows are keyed by their stable code.
INSERT INTO "app"."Court" ("id", "officeId", "name", "level", "state", "district", "bench", "code") VALUES
  ('court_in_sc', NULL, 'Supreme Court of India', 'SUPREME', NULL, NULL, NULL, 'IN-SC'),
  ('court_ka_hc_bengaluru', NULL, 'High Court of Karnataka, Principal Bench, Bengaluru', 'HIGH', 'Karnataka', 'Bengaluru Urban', 'Bengaluru', 'KA-HC-BENGALURU'),
  ('court_ka_hc_dharwad', NULL, 'High Court of Karnataka, Dharwad Bench', 'HIGH', 'Karnataka', 'Dharwad', 'Dharwad', 'KA-HC-DHARWAD'),
  ('court_ka_hc_kalaburagi', NULL, 'High Court of Karnataka, Kalaburagi Bench', 'HIGH', 'Karnataka', 'Kalaburagi', 'Kalaburagi', 'KA-HC-KALABURAGI'),
  ('court_ka_dc_bengaluru_city', NULL, 'City Civil and Sessions Court, Bengaluru', 'DISTRICT', 'Karnataka', 'Bengaluru Urban', NULL, 'KA-DC-BENGALURU-CITY'),
  ('court_ka_dc_bagalkote', NULL, 'District and Sessions Court, Bagalkote', 'DISTRICT', 'Karnataka', 'Bagalkote', NULL, 'KA-DC-BAGALKOTE'),
  ('court_ka_dc_ballari', NULL, 'District and Sessions Court, Ballari', 'DISTRICT', 'Karnataka', 'Ballari', NULL, 'KA-DC-BALLARI'),
  ('court_ka_dc_belagavi', NULL, 'District and Sessions Court, Belagavi', 'DISTRICT', 'Karnataka', 'Belagavi', NULL, 'KA-DC-BELAGAVI'),
  ('court_ka_dc_bengaluru_rural', NULL, 'District and Sessions Court, Bengaluru Rural', 'DISTRICT', 'Karnataka', 'Bengaluru Rural', NULL, 'KA-DC-BENGALURU-RURAL'),
  ('court_ka_dc_bidar', NULL, 'District and Sessions Court, Bidar', 'DISTRICT', 'Karnataka', 'Bidar', NULL, 'KA-DC-BIDAR'),
  ('court_ka_dc_chamarajanagar', NULL, 'District and Sessions Court, Chamarajanagar', 'DISTRICT', 'Karnataka', 'Chamarajanagar', NULL, 'KA-DC-CHAMARAJANAGAR'),
  ('court_ka_dc_chikkaballapura', NULL, 'District and Sessions Court, Chikkaballapura', 'DISTRICT', 'Karnataka', 'Chikkaballapura', NULL, 'KA-DC-CHIKKABALLAPURA'),
  ('court_ka_dc_chikkamagaluru', NULL, 'District and Sessions Court, Chikkamagaluru', 'DISTRICT', 'Karnataka', 'Chikkamagaluru', NULL, 'KA-DC-CHIKKAMAGALURU'),
  ('court_ka_dc_chitradurga', NULL, 'District and Sessions Court, Chitradurga', 'DISTRICT', 'Karnataka', 'Chitradurga', NULL, 'KA-DC-CHITRADURGA'),
  ('court_ka_dc_dakshina_kannada', NULL, 'District and Sessions Court, Dakshina Kannada', 'DISTRICT', 'Karnataka', 'Dakshina Kannada', NULL, 'KA-DC-DAKSHINA-KANNADA'),
  ('court_ka_dc_davanagere', NULL, 'District and Sessions Court, Davanagere', 'DISTRICT', 'Karnataka', 'Davanagere', NULL, 'KA-DC-DAVANAGERE'),
  ('court_ka_dc_dharwad', NULL, 'District and Sessions Court, Dharwad', 'DISTRICT', 'Karnataka', 'Dharwad', NULL, 'KA-DC-DHARWAD'),
  ('court_ka_dc_gadag', NULL, 'District and Sessions Court, Gadag', 'DISTRICT', 'Karnataka', 'Gadag', NULL, 'KA-DC-GADAG'),
  ('court_ka_dc_hassan', NULL, 'District and Sessions Court, Hassan', 'DISTRICT', 'Karnataka', 'Hassan', NULL, 'KA-DC-HASSAN'),
  ('court_ka_dc_haveri', NULL, 'District and Sessions Court, Haveri', 'DISTRICT', 'Karnataka', 'Haveri', NULL, 'KA-DC-HAVERI'),
  ('court_ka_dc_kalaburagi', NULL, 'District and Sessions Court, Kalaburagi', 'DISTRICT', 'Karnataka', 'Kalaburagi', NULL, 'KA-DC-KALABURAGI'),
  ('court_ka_dc_kodagu', NULL, 'District and Sessions Court, Kodagu', 'DISTRICT', 'Karnataka', 'Kodagu', NULL, 'KA-DC-KODAGU'),
  ('court_ka_dc_kolar', NULL, 'District and Sessions Court, Kolar', 'DISTRICT', 'Karnataka', 'Kolar', NULL, 'KA-DC-KOLAR'),
  ('court_ka_dc_koppal', NULL, 'District and Sessions Court, Koppal', 'DISTRICT', 'Karnataka', 'Koppal', NULL, 'KA-DC-KOPPAL'),
  ('court_ka_dc_mandya', NULL, 'District and Sessions Court, Mandya', 'DISTRICT', 'Karnataka', 'Mandya', NULL, 'KA-DC-MANDYA'),
  ('court_ka_dc_mysuru', NULL, 'District and Sessions Court, Mysuru', 'DISTRICT', 'Karnataka', 'Mysuru', NULL, 'KA-DC-MYSURU'),
  ('court_ka_dc_raichur', NULL, 'District and Sessions Court, Raichur', 'DISTRICT', 'Karnataka', 'Raichur', NULL, 'KA-DC-RAICHUR'),
  ('court_ka_dc_ramanagara', NULL, 'District and Sessions Court, Ramanagara', 'DISTRICT', 'Karnataka', 'Ramanagara', NULL, 'KA-DC-RAMANAGARA'),
  ('court_ka_dc_shivamogga', NULL, 'District and Sessions Court, Shivamogga', 'DISTRICT', 'Karnataka', 'Shivamogga', NULL, 'KA-DC-SHIVAMOGGA'),
  ('court_ka_dc_tumakuru', NULL, 'District and Sessions Court, Tumakuru', 'DISTRICT', 'Karnataka', 'Tumakuru', NULL, 'KA-DC-TUMAKURU'),
  ('court_ka_dc_udupi', NULL, 'District and Sessions Court, Udupi', 'DISTRICT', 'Karnataka', 'Udupi', NULL, 'KA-DC-UDUPI'),
  ('court_ka_dc_uttara_kannada', NULL, 'District and Sessions Court, Uttara Kannada', 'DISTRICT', 'Karnataka', 'Uttara Kannada', NULL, 'KA-DC-UTTARA-KANNADA'),
  ('court_ka_dc_vijayanagara', NULL, 'District and Sessions Court, Vijayanagara', 'DISTRICT', 'Karnataka', 'Vijayanagara', NULL, 'KA-DC-VIJAYANAGARA'),
  ('court_ka_dc_vijayapura', NULL, 'District and Sessions Court, Vijayapura', 'DISTRICT', 'Karnataka', 'Vijayapura', NULL, 'KA-DC-VIJAYAPURA'),
  ('court_ka_dc_yadgir', NULL, 'District and Sessions Court, Yadgir', 'DISTRICT', 'Karnataka', 'Yadgir', NULL, 'KA-DC-YADGIR')
ON CONFLICT ("code") DO NOTHING;
