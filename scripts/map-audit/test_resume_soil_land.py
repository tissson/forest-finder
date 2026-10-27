import unittest
import numpy as np
from resume_soil_land import reduce_row


class MosaicReductionRules(unittest.TestCase):
    def test_aligned_cell_rules(self):
        a = np.full((1000, 2000), 255, dtype=np.uint8)
        a[:250, :1000] = 1
        a[250:500, :1000] = 2
        a[500:750, :1000] = 3
        a[750:, :1000] = 4
        a[:, 1000:] = 4
        land, water, valid = reduce_row(a)
        self.assertAlmostEqual(land[0], (.15 + .45 + .70) / 3)
        self.assertTrue(np.isnan(land[1]))
        np.testing.assert_array_equal(water, [.25, 1])
        np.testing.assert_array_equal(valid, [1, 1])

    def test_uncovered_area_remains_in_fraction_denominator(self):
        a = np.full((1000, 1000), 255, dtype=np.uint8)
        a[0, 0] = 1
        a[0, 1] = 4
        land, water, valid = reduce_row(a)
        self.assertEqual(land[0], .15)
        self.assertEqual(water[0], .000001)
        self.assertEqual(valid[0], .000002)


if __name__ == '__main__':
    unittest.main()