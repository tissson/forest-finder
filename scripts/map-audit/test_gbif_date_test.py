import unittest
from datetime import date, timedelta
from gbif_date_test import calendar_distance, control_dates, daily_terms, location


class DateExportTests(unittest.TestCase):
    def test_coordinates_round_to_one_decimal(self):
        self.assertEqual(location({'latitude':'59.25', 'longitude':'18.04'}), ('59.3', '18.0'))

    def test_twenty_fixed_seed_controls_exclude_own_day(self):
        days = [date(2020, 1, 1)+timedelta(days=i) for i in range(2192)]
        event = date(2024, 8, 10)
        result = control_dates(event, days, 'example')
        self.assertEqual(len(set(result)), 20)
        self.assertNotIn(event, result)
        self.assertTrue(all(2020 <= d.year <= 2025 for d in result))
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

    def test_calendar_window_wraps_year_end(self):
        self.assertEqual(calendar_distance(date(2023,12,31), date(2024,1,1)), 1)
        self.assertEqual(calendar_distance(date(2023,7,1), date(2024,7,1)), 0)


if __name__ == '__main__':
    unittest.main()