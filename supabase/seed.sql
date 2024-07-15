-- Seeds the launch topics. Question content arrives through the import pipeline
-- (milestone 04), not here: seeds are for rows the application cannot create.
insert into content.topics (slug, name, description, icon_key, display_color, sort_order)
values
  ('history', 'History', 'Empires, revolutions, and the people who changed the map.', 'landmark', 'amber', 10),
  ('geography', 'Geography', 'Countries, capitals, rivers, and the shape of the world.', 'globe-2', 'teal', 20),
  ('science', 'Science', 'Physics, chemistry, biology, and the ideas underneath them.', 'flask-conical', 'violet', 30),
  ('technology', 'Technology', 'Computing, engineering, and how modern tools came to be.', 'cpu', 'blue', 40),
  ('sports', 'Sports', 'Records, competitions, and the stories behind great seasons.', 'trophy', 'rose', 50),
  ('literature', 'Literature', 'Novels, poems, playwrights, and memorable lines.', 'book-open', 'indigo', 60),
  ('economy', 'Economy', 'Markets, policy, and how money moves through a country.', 'trending-up', 'emerald', 70)
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description,
      icon_key = excluded.icon_key,
      display_color = excluded.display_color,
      sort_order = excluded.sort_order;
