-- The NEET import put the item count in `shift_label`; a shift label is "Shift 1", not "45".
--
-- The card printed the stray "45" under the paper label. The import carried no shift, so the
-- honest value is NULL; nothing reads it as a number.

update content.papers
   set shift_label = null
 where slug = 'neet-ug-2025'
   and shift_label = '45';
