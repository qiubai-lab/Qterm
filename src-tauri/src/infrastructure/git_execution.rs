use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct GitExecutionBudget {
    inactivity: Duration,
    total: Duration,
}

impl GitExecutionBudget {
    pub(crate) const fn new(inactivity: Duration, total: Duration) -> Self {
        Self { inactivity, total }
    }

    pub(crate) const fn fixed(duration: Duration) -> Self {
        Self::new(duration, duration)
    }

    pub(crate) const fn inactivity(self) -> Duration {
        self.inactivity
    }

    pub(crate) fn remaining_total(self, started: Instant, now: Instant) -> Option<Duration> {
        self.total
            .checked_sub(now.saturating_duration_since(started))
    }

    pub(crate) fn expired(self, started: Instant, last_activity: Instant, now: Instant) -> bool {
        now.saturating_duration_since(started) >= self.total
            || now.saturating_duration_since(last_activity) >= self.inactivity
    }
}

pub(crate) const GIT_READ_BUDGET: GitExecutionBudget =
    GitExecutionBudget::new(Duration::from_secs(30), Duration::from_secs(120));
pub(crate) const GIT_MUTATION_BUDGET: GitExecutionBudget =
    GitExecutionBudget::new(Duration::from_secs(60), Duration::from_secs(300));
pub(crate) const GIT_NETWORK_BUDGET: GitExecutionBudget =
    GitExecutionBudget::new(Duration::from_secs(120), Duration::from_secs(1_800));

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn activity_extends_idle_time_without_extending_the_total_limit() {
        let budget = GitExecutionBudget::new(Duration::from_secs(10), Duration::from_secs(30));
        let started = Instant::now();
        let activity = started + Duration::from_secs(9);

        assert!(!budget.expired(started, activity, started + Duration::from_secs(15)));
        assert!(budget.expired(started, activity, started + Duration::from_secs(19)));
        assert!(budget.expired(
            started,
            started + Duration::from_secs(29),
            started + Duration::from_secs(30)
        ));
    }

    #[test]
    fn remaining_total_never_outlives_the_hard_limit() {
        let budget = GitExecutionBudget::new(Duration::from_secs(10), Duration::from_secs(30));
        let started = Instant::now();

        assert_eq!(
            budget.remaining_total(started, started + Duration::from_secs(12)),
            Some(Duration::from_secs(18))
        );
        assert_eq!(
            budget.remaining_total(started, started + Duration::from_secs(31)),
            None
        );
    }
}
