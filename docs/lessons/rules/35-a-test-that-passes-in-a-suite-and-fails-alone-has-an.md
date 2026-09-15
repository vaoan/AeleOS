# Rule 35: A test that passes in a suite and fails alone has an isolation defect, and the defect is evidence about the SUITE.

35. **A test that passes in a suite and fails alone has an isolation defect,
    and the defect is evidence about the SUITE.** The two are not the same
    program: running the file gives every case the fixtures its neighbours
    built, running one gives it only its own. This is how a case that depends
    on a neighbour looks perfectly healthy for months.

    It is worth stating because the diagnostic instinct is backwards. A case
    failing alone reads as "the filter is wrong" or "the runner is flaky", and
    both were assumed here before the real answer — that the file under test
    had been reverted out from under it by rule 34's trap. **Check what the
    isolated run is actually missing before concluding the isolation is at
    fault**, because the same symptom covers a genuine dependency between cases
    and a source file that is no longer what you think it is.
