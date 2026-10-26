import unittest
from soil_land_rules import soil_metrics


class SoilLandRules(unittest.TestCase):
    def test_land_weights_and_water_exclusion(self):
        self.assertAlmostEqual(soil_metrics([1, 2, 3, 4])["land"], (0.15 + 0.45 + 0.70) / 3)

    def test_unknown_and_padding_excluded(self):
        self.assertEqual(soil_metrics([1, 0, 4, 5, 255])["land"], 0.15)

    def test_water_fraction_uses_all_pixels(self):
        self.assertEqual(soil_metrics([4, 4, 1, 255])["water"], 0.5)

    def test_valid_fraction_uses_classes_one_to_four(self):
        self.assertEqual(soil_metrics([0, 1, 2, 3, 4, 5, 255])["valid"], 4 / 7)

    def test_no_land_is_null(self):
        self.assertIsNone(soil_metrics([0, 4, 5, 255])["land"])


if __name__ == "__main__":
    unittest.main()