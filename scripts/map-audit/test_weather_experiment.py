import unittest
import numpy as np
from weather_experiment import idw, moisture, penalty

class WeatherExperimentTests(unittest.TestCase):
    def test_exact_point_uses_its_own_raw_weather(self):
        np.testing.assert_array_equal(idw([[5, 20, 25], [15, 30, 50]], [0, 100]), [5, 20, 25])
    def test_four_equal_distances_average_raw_weather(self):
        np.testing.assert_array_equal(idw([[0,0,0],[4,4,4],[8,8,8],[12,12,12]], [10,10,10,10]), [6,6,6])
    def test_live_penalty_rules(self):
        self.assertEqual(penalty(1), .45); self.assertEqual(penalty(25), .45)
        self.assertEqual(penalty(8), 0); self.assertEqual(penalty(17), 0)
        self.assertEqual(penalty(2), .15); self.assertEqual(penalty(None), 0)
    def test_no_hard_rain_plateau_experiment(self):
        self.assertAlmostEqual(moisture(10,40,70,exponential=True), 1-np.exp(-1))
        self.assertGreater(moisture(10,41,71,exponential=True), moisture(10,40,70,exponential=True))
        self.assertEqual(moisture(10,40,70), 1)
    def test_smooth_penalty_continuous_at_live_jumps(self):
        for t in [2,8,17,24]:
            self.assertLess(abs(penalty(t-1e-5,True)-penalty(t+1e-5,True)), 1e-8)
    def test_invalid_rain_is_rejected_not_silently_scored(self):
        with self.assertRaises(ValueError): moisture(10,-1,2)
        with self.assertRaises(ValueError): moisture(10,5,4)
    def test_zero_rain_and_missing_inputs_remain_bounded(self):
        self.assertEqual(moisture(None,None,None),0)
        self.assertEqual(moisture(-20,0,0,True,True),0)
        self.assertLessEqual(moisture(10,10000,10000,True,True),1)

if __name__ == '__main__': unittest.main()
