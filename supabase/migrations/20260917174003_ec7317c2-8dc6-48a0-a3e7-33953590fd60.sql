revoke all on function public.lookup_weather_zone(double precision, double precision) from public;
revoke all on function public.get_or_create_profile() from public;
revoke all on function public.log_species_discovery(bigint, bigint, text, double precision, text, text) from public;
grant execute on function public.lookup_weather_zone(double precision, double precision) to authenticated;
grant execute on function public.get_or_create_profile() to authenticated;
grant execute on function public.log_species_discovery(bigint, bigint, text, double precision, text, text) to authenticated;