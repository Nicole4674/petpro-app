-- =============================================================================
-- Route Optimizer Test Data v1
-- =============================================================================
-- Seeds 6 fake [TEST] clients at REAL Cypress / Tomball / Spring TX addresses,
-- each with a pet and a grooming appointment for TODAY.
--
-- Times are INTENTIONALLY scrambled vs. geographic order so the optimizer has
-- real work to do. You should see "Saves ~25-40 min" when you click Optimize.
--
-- The 6 stops are spread across ~15 miles in 3 clusters:
--   • South Cypress    (2 stops near 77429/77433)
--   • Spring (east)    (1 stop near 77379)
--   • Tomball (north)  (3 stops near 77375/77377)
--
-- Time-order is chaotic — first appointment is south Cypress, second jumps
-- north to Tomball, third bounces back south, etc. The optimizer should
-- regroup them into geographic clusters.
--
-- HOW TO RUN:
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file
--   3. Click Run
--   4. Should see "Success. No rows returned"
--   5. Refresh /route in PetPro — you'll see 6 new [TEST] stops added
--   6. Click Optimize Route → should see big savings banner
--
-- CLEANUP (when you're done testing — paste in SQL Editor):
--   delete from appointments where pet_id in (select id from pets where name like '[TEST]%');
--   delete from pets where name like '[TEST]%';
--   delete from clients where first_name like '[TEST]%';
-- =============================================================================


do $$
declare
  groomer_uuid uuid;
  service_uuid uuid;
  v_client_id uuid;
  v_pet_id uuid;
  test_row record;
begin
  -- 1. Find your user_id from the auth.users table
  select id into groomer_uuid
  from auth.users
  where email = 'treadwell4674@gmail.com';

  if groomer_uuid is null then
    raise exception 'Could not find user with email treadwell4674@gmail.com';
  end if;

  -- 2. Grab the first service this groomer offers (any one will do for test data)
  select id into service_uuid
  from services
  where groomer_id = groomer_uuid
  limit 1;

  if service_uuid is null then
    raise exception 'No services found — create at least one service in Pricing first';
  end if;

  -- 3. Loop through 6 fake clients and seed everything
  for test_row in
    select * from (values
      -- (first_name, last_name, phone,          address,                                            lat,      lng,       notes,                              appt_time)
      ('Maria',  'Lopez',    '281-555-0101', '18802 Tomball Pkwy, Cypress, TX 77433',      29.9555, -95.6492, 'Big white house, gate code 1234',        '09:00:00'::time),
      ('John',   'Chen',     '281-555-0102', '13601 Cypresswood Dr, Cypress, TX 77429',    29.9711, -95.6155, 'Side gate unlocked, dog in backyard',    '13:30:00'::time),
      ('Sarah',  'Patel',    '281-555-0103', '8901 Louetta Rd, Spring, TX 77379',          30.0344, -95.5512, 'Park in driveway, ring twice',           '10:00:00'::time),
      ('David',  'Williams', '281-555-0104', '2502 W Main St, Tomball, TX 77375',          30.0972, -95.6189, 'Two black labs — friendly',              '15:00:00'::time),
      ('Lisa',   'Garcia',   '281-555-0105', '21703 Northpointe Bend, Tomball, TX 77377',  30.0801, -95.6633, 'Use back door, code 8821',               '11:00:00'::time),
      ('Kevin',  'Brown',    '281-555-0106', '11500 Spring Cypress Rd, Tomball, TX 77377', 30.0510, -95.6731, 'Side door, watch out for the cat',       '14:00:00'::time)
    ) as t(first_name, last_name, phone, address, lat, lng, notes, appt_time)
  loop
    -- Insert client (with cached lat/lng so map renders instantly)
    insert into clients (groomer_id, first_name, last_name, phone, address, latitude, longitude, address_notes)
    values (
      groomer_uuid,
      '[TEST] ' || test_row.first_name,
      test_row.last_name,
      test_row.phone,
      test_row.address,
      test_row.lat,
      test_row.lng,
      test_row.notes
    )
    returning id into v_client_id;

    -- Insert pet (pets table requires groomer_id — not just client_id)
    insert into pets (groomer_id, client_id, name, breed)
    values (
      groomer_uuid,
      v_client_id,
      '[TEST] ' || test_row.first_name || '''s Dog',
      'Mixed Breed'
    )
    returning id into v_pet_id;

    -- Insert appointment for TODAY at the scrambled time
    insert into appointments (groomer_id, client_id, pet_id, service_id, appointment_date, start_time, status)
    values (
      groomer_uuid,
      v_client_id,
      v_pet_id,
      service_uuid,
      current_date,
      test_row.appt_time,
      'scheduled'
    );
  end loop;

  raise notice 'Seeded 6 [TEST] clients + appointments for %', current_date;
end $$;
