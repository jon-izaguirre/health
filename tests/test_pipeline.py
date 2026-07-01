import pytest
import sys
import os
import math
from unittest.mock import patch, MagicMock

# Add src to path for testing
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../src')))

from hrv import compute_hrv
from fit_parse import parse_fit

def test_hrv_filtering():
    # Test physiological filter: drops <300 and >2000
    raw_rr = [250, 800, 810, 2100, 820]
    result = compute_hrv(raw_rr, "ex1")
    # Valid beats: 800, 810, 820 -> 3 beats
    assert result is not None
    assert result["n_beats"] == 3
    # Artifacts %: initial was 5, kept 3 -> 40%
    assert result["artifacts_pct"] == 40.0
    assert "Low confidence" in result["notes"]

    # Test ectopic filter: drops if difference > 20%
    raw_rr = [800, 1000, 810, 820] 
    # 800 -> 1000 (diff 200, 25% of 800 -> drop)
    # 800 -> 810 (diff 10, <20% -> keep)
    # 810 -> 820 (diff 10, <20% -> keep)
    result = compute_hrv(raw_rr, "ex2")
    assert result["n_beats"] == 3
    assert result["artifacts_pct"] == 25.0 # 1 out of 4 dropped

def test_hrv_computation():
    # Constant RR -> RMSSD = 0
    raw_rr = [800, 800, 800, 800]
    result = compute_hrv(raw_rr, "ex3")
    assert result["rmssd_ms"] == 0.0
    assert result["ln_rmssd"] == 0.0
    assert result["mean_rr_ms"] == 800.0
    assert result["mean_hr"] == 75.0 # 60000 / 800

def test_fit_parse_no_hrv():
    # Mocking fitparse to return no hrv messages
    with patch("fit_parse.FitFile") as MockFitFile:
        mock_fit = MagicMock()
        
        # Create a mock record message with heart rate
        mock_record = MagicMock()
        mock_record.name = 'record'
        
        ts_data = MagicMock()
        ts_data.name = 'timestamp'
        import datetime
        ts_data.value = datetime.datetime.now()
        
        hr_data = MagicMock()
        hr_data.name = 'heart_rate'
        hr_data.value = 120
        
        mock_record.__iter__.return_value = [ts_data, hr_data]
        
        mock_fit.get_messages.return_value = [mock_record]
        MockFitFile.return_value = mock_fit
        
        hr_series, rr_series = parse_fit(b"dummybytes")
        
        assert len(hr_series) == 1
        assert len(rr_series) == 0

def test_fit_parse_filter_sentinel():
    with patch("fit_parse.FitFile") as MockFitFile:
        mock_fit = MagicMock()
        
        mock_hrv = MagicMock()
        mock_hrv.name = 'hrv'
        
        time_data = MagicMock()
        time_data.name = 'time'
        # 65535 is sentinel, 0.8 is 800ms
        time_data.value = [0.8, 65535, 65.535] 
        
        mock_hrv.__iter__.return_value = [time_data]
        
        mock_fit.get_messages.return_value = [mock_hrv]
        MockFitFile.return_value = mock_fit
        
        _, rr_series = parse_fit(b"dummybytes")
        
        assert len(rr_series) == 1
        assert rr_series[0] == 800.0

@patch("sync.PolarClient")
@patch("sync.SheetsClient")
def test_sync_dedupe_and_sheet_error(MockSheetsClient, MockPolarClient):
    import sync
    
    mock_polar = MagicMock()
    mock_polar.list_exercises.return_value = ["https://api/v3/exercises/123", "https://api/v3/exercises/456"]
    MockPolarClient.return_value = mock_polar
    
    mock_sheets = MagicMock()
    # 123 is already in sheets, 456 is new
    mock_sheets.get_existing_exercise_ids.return_value = {"123"}
    # Simulate batch_append throwing an exception (network error etc)
    mock_sheets.batch_append.side_effect = Exception("Mocked sheet error")
    MockSheetsClient.return_value = mock_sheets
    
    # We expect sys.exit(1) because sheet writing failed
    try:
        sync.main()
    except SystemExit as e:
        assert e.code == 1
        
    # Check that it only tried to process 456, skipping 123
    mock_polar.get_exercise_summary.assert_called_once_with("https://api/v3/exercises/456")
    
    # Check that batch_append was called, even if it threw
    assert mock_sheets.batch_append.called
