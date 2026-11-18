//! Cahiers Jupyter (`.ipynb` `nbformat` v4) et moteur d'exécution ZeroMQ complet
//! pour Atelier Studio.

pub mod context;
pub mod kernelspec;
pub mod nbformat;
pub mod proposals;
pub mod session;
pub mod wire;
pub mod zmtp;

pub use context::{
    analyze_neighborhood, diff_notebooks, project_for_agent, validate_proposed_code, CellDiffEntry,
    CellNeighborhood, DiffLine, DownstreamConsumer, EditDiagnostics, ImportBinding,
};
pub use kernelspec::{
    discover_kernels, select_default_kernel, DiscoveredKernel, KernelBackendKind,
};
pub use nbformat::{
    strip_ansi, CellKind, CellOutput, NotebookCell, NotebookDocument, NotebookError, UiCell,
    UiOutput,
};
pub use proposals::{CellProposal, ProposalKind};
pub use session::{
    base64_decode, base64_encode, InputRequest, NotebookEventListener, NotebookKernelStatus,
    NotebookManager, NotebookPushEvent, NotebookSnapshot, NotebookWorkspace, RecoveryInfo,
};
pub use wire::LiveVariable;
