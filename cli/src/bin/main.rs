use clap::Parser;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::str::FromStr;

use mpc_websocket::{Result, Server};

#[derive(Debug, Parser)]
#[clap(
    name = "mpc-websocket",
    about = "Websocket server for MPC key generation and signing"
)]
struct Options {
    /// Bind to host:port.
    #[structopt(short, long)]
    bind: Option<String>,
    /// Path to static files to serve
    #[structopt(parse(from_os_str))]
    files: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let opts: Options = Parser::parse();
    let bind = opts.bind.unwrap_or_else(|| "0.0.0.0:3030".to_string());
    let addr = SocketAddr::from_str(&bind)?;

    let static_files = if let Some(static_files) = opts.files {
        if static_files.is_absolute() {
            static_files
        } else {
            let cwd = std::env::current_dir()?;
            cwd.join(static_files)
        }
    } else {
        let mut static_files = std::env::current_dir()?;
        static_files.pop();
        static_files.push("demo");
        static_files.push("dist");
        static_files
    };

    Server::start("mpc", (addr.ip(), addr.port()), static_files).await
}
