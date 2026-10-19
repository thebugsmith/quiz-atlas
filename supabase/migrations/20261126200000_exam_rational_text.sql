-- Fix: numeric::text kept the working scale ("4.0000000000000000"), so a reduced fraction
-- did not match the rational grammar on the next addition. Cast through bigint: every
-- value here is a small hand-written mark, and the fraction is already reduced.
create or replace function public.exam_rational_add(p_left text, p_right text)
returns text
language plpgsql
immutable
as $$
declare
  l numeric[];
  r numeric[];
  num numeric;
  den numeric;
  a numeric;
  b numeric;
  t numeric;
begin
  l := public.exam_rational_parts(p_left);
  r := public.exam_rational_parts(p_right);
  num := l[1] * r[2] + r[1] * l[2];
  den := l[2] * r[2];
  if num = 0 then
    return '0';
  end if;

  a := abs(num);
  b := abs(den);
  while b <> 0 loop
    t := mod(a, b);
    a := b;
    b := t;
  end loop;

  num := num / a;
  den := den / a;
  if den = 1 then
    return (num::bigint)::text;
  end if;
  return (num::bigint)::text || '/' || (den::bigint)::text;
end;
$$;

revoke all on function public.exam_rational_add(text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.exam_rational_add(text, text) to service_role;
  end if;
end
$$;
