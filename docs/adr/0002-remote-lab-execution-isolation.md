# Remote Lab Separates the Control Platform from Tested Execution

Status: accepted

Remote Lab lets developers provide TypeScript cases. That code can loop
forever, hang, or ignore cancellation, while the control platform still has to
remain editable, observable, and stoppable. Therefore the project service owns
the run, and tested code enters an independently terminable execution
environment. The workbench and its control service do not share an
uninterruptible execution thread with user code. Stop first attempts normal
cleanup, then force-terminates the environment owned by this execution within a
bounded interval. This accepts the cost of passing control and records across an
execution boundary in exchange for ensuring runaway tests cannot take down the
platform. Merely waiting for a Promise to settle or sending an AbortSignal is not
enough to provide that guarantee.

Forced termination does not mean every external effect created by application
code has rolled back. The platform reports termination and resource cleanup
results separately according to the evidence it has. Process and browser
assembly details are left to implementation; this ADR does not claim that
isolation is complete.
