import unittest
from datetime import date, timedelta
from gbif_date_test import calendar_distance, control_dates, daily_terms, location, groups_for, request_cost, budget_wait, retry_seconds


class DateExportTests(unittest.TestCase):
    def test_coordinates_round_to_one_decimal(self):
        self.assertEqual(location({'latitude':'59.25', 'longitude':'18.04'}), ('59.3', '18.0'))

    def test_twenty_fixed_seed_controls_exclude_own_day(self):
        days = [date(2020, 1, 1)+timedelta(days=i) for i in range(2192)]
        event = date(2024, 8, 10)
        result = control_dates(event, days, 'example')
        self.assertEqual(len(set(result)), 20)
        self.assertNotIn(event, result)
        self.assertTrue(all(d.year == 2024 for d in result))
        self.assertTrue(all(3 < abs((d-event).days) <= 30 for d in result))
        self.assertTrue(all(calendar_distance(d, event) <= 30 for d in result))
        self.assertEqual(result, control_dates(event, days, 'example'))

    def test_rain_uses_seven_and_ten_days_including_target(self):
        daily = {'time':[(date(2020,7,1)+timedelta(days=i)).isoformat() for i in range(11)],
                 'precipitation_sum': list(range(1,12)), 'temperature_2m_mean':[15]*11}
        terms = daily_terms(daily)
        self.assertEqual(terms[date(2020,7,10)], (49,55,15))
        self.assertNotIn(date(2020,7,9), terms)
        daily['precipitation_sum'][5] = None
        self.assertNotIn(date(2020,7,10), daily_terms(daily))

    def test_union_same_location_year_and_species_order(self):
        rows = [dict(latitude='60.01', longitude='18.01', event_date='2024-08-01', species='Rubus chamaemorus'),
                dict(latitude='60.02', longitude='18.02', event_date='2024-09-01', species='Craterellus tubaeformis'),
                dict(latitude='59', longitude='17', event_date='2023-08-01', species='Rubus chamaemorus')]
        groups = groups_for(rows)
        self.assertEqual(len(groups), 2)
        self.assertEqual(groups[0]['start'], date(2024, 6, 22))
        self.assertEqual(groups[0]['end'], date(2024, 10, 1))
        self.assertEqual(len(groups[0]['rows']), 2)

    def test_short_request_weight_inclusive(self):
        self.assertEqual(request_cost(date(2024, 6, 22), date(2024, 8, 31)), 6)

    def test_full_history_required_for_controls(self):
        start = date(2024, 7, 1)
        daily = dict(time=[str(start+timedelta(days=i)) for i in range(71)],
                     precipitation_sum=[1]*71, temperature_2m_mean=[15]*71)
        terms = daily_terms(daily)
        event = start+timedelta(days=40)
        controls = control_dates(event, terms, 'history')
        self.assertEqual(len(controls), 20)
        self.assertTrue(all(d >= start+timedelta(days=9) for d in controls))

    def test_budget_pauses_before_limit(self):
        self.assertEqual(budget_wait([dict(timestamp=100, cost=4000)], 6, 101), 3600)
        self.assertEqual(budget_wait([], 6, 101), 0)

    def test_retry_after_seconds_and_http_date(self):
        self.assertEqual(retry_seconds('600', 0), 600)
        self.assertEqual(retry_seconds('Thu, 01 Jan 1970 00:10:00 GMT', 100), 500)

    def test_calendar_window_wraps_year_end(self):
        self.assertEqual(calendar_distance(date(2023,12,31), date(2024,1,1)), 1)
        self.assertEqual(calendar_distance(date(2023,7,1), date(2024,7,1)), 0)


if __name__ == '__main__':
    unittest.main()