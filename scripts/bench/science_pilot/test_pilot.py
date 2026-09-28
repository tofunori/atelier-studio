import json
from pathlib import Path
import tempfile
import unittest

from grade import grade, same
from run import summarize_events
from suite import cases


class GradingTests(unittest.TestCase):
    def test_numeric_types_and_nonfinite(self):
        self.assertFalse(same(True, 1))
        self.assertFalse(same(float('nan'), 0))
        self.assertFalse(same('0.1', .1))
        self.assertTrue(same(.100000000001, .1))
        self.assertFalse(same({}, {'missing':None}))

    def test_hardcoded_answer_fails_changed_input(self):
        case = next(c for c in cases() if c['id']=='04_area_weighting')
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name, text in case['files'].items():
                (root/name).write_text(text)
            payload = json.dumps(case['expected'])
            (root/'answer.json').write_text(payload)
            (root/'analyze.py').write_text(f'from pathlib import Path\nPath("answer.json").write_text({payload!r})\n')
            result = grade(case, root)
            self.assertTrue(result['checks']['fresh_process_reproduction'])
            self.assertFalse(result['checks']['changed_input_reproduction'])
            self.assertFalse(result['all_pass'])

    def test_general_weighted_script_passes_and_protects_inputs(self):
        case = next(c for c in cases() if c['id']=='04_area_weighting')
        script = '''import csv,json
with open('zones.csv') as f: rows=list(csv.DictReader(f))
area=sum(float(r['area_km2']) for r in rows)
change=sum(float(r['area_km2'])*(float(r['after'])-float(r['before'])) for r in rows)/area
with open('answer.json','w') as f: json.dump({'weighted_change_albedo':change,'total_area_km2':area},f)
'''
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name,text in case['files'].items():
                (root/name).write_text(text)
            (root/'answer.json').write_text(json.dumps(case['expected']))
            (root/'analyze.py').write_text(script)
            self.assertTrue(grade(case, root)['all_pass'])
            (root/'zones.csv').write_text('changed')
            self.assertFalse(grade(case, root)['checks']['inputs_unchanged'])

    def test_provider_error_never_becomes_success(self):
        result = summarize_events('codex',[{'type':'turn.failed','error':{'message':'transport'}}])
        self.assertFalse(result['terminal_success'])
        self.assertIsNone(result['usage'])
        result = summarize_events('claude',[{'type':'result','subtype':'error_during_execution','is_error':True}])
        self.assertFalse(result['terminal_success'])
        self.assertIsNone(result['cost_estimate_usd'])

    def test_provider_usage_preserves_missing_values(self):
        result = summarize_events('codex',[{'type':'turn.completed','usage':{'input_tokens':12,'output_tokens':4}}])
        self.assertTrue(result['terminal_success'])
        self.assertIsNone(result['cost_estimate_usd'])
        self.assertEqual(result['usage']['input_tokens'],12)


if __name__ == '__main__':
    unittest.main()
