//! Protocole de transport ZeroMQ pur Rust (ZMTP 3.0 / 3.1, RFC 37) sur TCP
//! avec mécanisme `NULL` (le mécanisme standard de tous les noyaux Jupyter
//! locaux ou tunnelés par SSH : `ipykernel`, `IRkernel`, `IJulia`).
//!
//! Aucune dépendance C (`libzmq`) : tout passe par `tokio::net::TcpStream`, ce
//! qui garantit la portabilité macOS / Linux et l'absence de surprises à
//! l'édition de liens.

use std::io;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ZmqSocketType {
    Dealer,
    Router,
    Sub,
    Pub,
    Req,
    Rep,
}

impl ZmqSocketType {
    pub fn as_zmtp_str(self) -> &'static str {
        match self {
            Self::Dealer => "DEALER",
            Self::Router => "ROUTER",
            Self::Sub => "SUB",
            Self::Pub => "PUB",
            Self::Req => "REQ",
            Self::Rep => "REP",
        }
    }
}

pub struct ZmtpSocket {
    stream: TcpStream,
    socket_type: ZmqSocketType,
}

impl ZmtpSocket {
    /// Connecte un socket ZMTP client (`DEALER`, `SUB`, `REQ`) à `addr` et
    /// effectue la poignée de main complète (Greeting 64 octets + commande `READY`).
    pub async fn connect(
        addr: &str,
        socket_type: ZmqSocketType,
        identity: Option<&[u8]>,
    ) -> io::Result<Self> {
        let mut stream = TcpStream::connect(addr).await?;
        let _ = stream.set_nodelay(true);
        Self::handshake(&mut stream, socket_type, identity).await?;
        let mut sock = Self {
            stream,
            socket_type,
        };
        if socket_type == ZmqSocketType::Sub {
            // Abonnement ZMTP 3.x à tous les sujets : préfixe vide précédé de 0x01.
            sock.send_multipart(&[vec![0x01]]).await?;
        }
        Ok(sock)
    }

    /// Enveloppe un `TcpStream` déjà accepté (utilisé par les pairs `ROUTER`/`PUB`/`REP` de test).
    pub async fn from_accepted(
        mut stream: TcpStream,
        socket_type: ZmqSocketType,
        identity: Option<&[u8]>,
    ) -> io::Result<Self> {
        let _ = stream.set_nodelay(true);
        Self::handshake(&mut stream, socket_type, identity).await?;
        Ok(Self {
            stream,
            socket_type,
        })
    }

    async fn handshake(
        stream: &mut TcpStream,
        socket_type: ZmqSocketType,
        identity: Option<&[u8]>,
    ) -> io::Result<()> {
        // 1. Greeting de 64 octets : signature (10) + version 3.0 (2) + mécanisme NULL (20) + as-server 0 (1) + remplissage (31).
        let mut greeting = [0u8; 64];
        greeting[0] = 0xFF;
        greeting[8] = 0x01;
        greeting[9] = 0x7F;
        greeting[10] = 3;
        greeting[11] = 0;
        greeting[12..16].copy_from_slice(b"NULL");

        stream.write_all(&greeting).await?;
        stream.flush().await?;

        // Lire la signature + majeur (11 octets), puis le reste (53 octets), comme un pair ZMTP 3.x tolérant.
        let mut peer_greeting = [0u8; 64];
        stream.read_exact(&mut peer_greeting[..11]).await?;
        if peer_greeting[0] != 0xFF || peer_greeting[9] != 0x7F || peer_greeting[10] < 3 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("signature ZMTP invalide (majeur={})", peer_greeting[10]),
            ));
        }
        stream.read_exact(&mut peer_greeting[11..]).await?;

        // 2. Commande READY : `\x05READY` + dictionnaire de propriétés ZMTP.
        let ready_payload = build_ready_command(socket_type, identity);
        write_frame(stream, 0x04, &ready_payload).await?;
        stream.flush().await?;

        let (flags, cmd) = read_raw_frame(stream).await?;
        if (flags & 0x04) == 0 || cmd.len() < 6 || &cmd[..6] != b"\x05READY" {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "commande ZMTP READY attendue du pair",
            ));
        }
        Ok(())
    }

    /// Envoie un message multipart ZMTP.
    /// Pour `REQ`, ZMTP insère automatiquement une trame séparatrice vide en tête.
    pub async fn send_multipart(&mut self, frames: &[Vec<u8>]) -> io::Result<()> {
        if self.socket_type == ZmqSocketType::Req {
            let flags = if frames.is_empty() { 0x00 } else { 0x01 };
            write_frame(&mut self.stream, flags, &[]).await?;
        }
        for (idx, frame) in frames.iter().enumerate() {
            let more = idx + 1 < frames.len();
            let flags = if more { 0x01 } else { 0x00 };
            write_frame(&mut self.stream, flags, frame).await?;
        }
        self.stream.flush().await
    }

    /// Lit le prochain message multipart de données (répond automatiquement `PONG` aux commandes `PING`).
    pub async fn recv_multipart(&mut self) -> io::Result<Vec<Vec<u8>>> {
        let mut parts = Vec::new();
        loop {
            let (flags, payload) = read_raw_frame(&mut self.stream).await?;
            let is_command = (flags & 0x04) != 0;
            if is_command {
                if payload.starts_with(b"\x04PING") {
                    // `PING` : 1 octet longueur nom (4) + "PING" + 2 octets TTL + contexte (≤16 octets).
                    let ctx = if payload.len() > 7 { &payload[7..] } else { &[] };
                    let mut pong = Vec::with_capacity(5 + ctx.len());
                    pong.push(4);
                    pong.extend_from_slice(b"PONG");
                    pong.extend_from_slice(ctx);
                    write_frame(&mut self.stream, 0x04, &pong).await?;
                    self.stream.flush().await?;
                }
                continue;
            }
            parts.push(payload);
            if (flags & 0x01) == 0 {
                break;
            }
        }
        if self.socket_type == ZmqSocketType::Req && parts.first().is_some_and(Vec::is_empty) {
            parts.remove(0);
        }
        Ok(parts)
    }

    /// Scinde le socket en moitié lecture et moitié écriture pour les canaux bidirectionnels (`shell`, `control`).
    pub fn into_split(
        self,
    ) -> (
        ZmtpReader<tokio::net::tcp::OwnedReadHalf>,
        ZmtpWriter<tokio::net::tcp::OwnedWriteHalf>,
    ) {
        let (r, w) = self.stream.into_split();
        (
            ZmtpReader {
                reader: r,
                socket_type: self.socket_type,
            },
            ZmtpWriter {
                writer: w,
                socket_type: self.socket_type,
            },
        )
    }
}

pub struct ZmtpReader<R> {
    reader: R,
    socket_type: ZmqSocketType,
}

pub struct ZmtpWriter<W> {
    writer: W,
    socket_type: ZmqSocketType,
}

impl<R: AsyncReadExt + Unpin> ZmtpReader<R> {
    pub async fn recv_multipart(&mut self) -> io::Result<Vec<Vec<u8>>> {
        let mut parts = Vec::new();
        loop {
            let (flags, payload) = read_raw_frame(&mut self.reader).await?;
            if (flags & 0x04) != 0 {
                // Les commandes asynchrones (PING/SUBSCRIBE) sont ignorées côté lecteur pur.
                continue;
            }
            parts.push(payload);
            if (flags & 0x01) == 0 {
                break;
            }
        }
        if self.socket_type == ZmqSocketType::Req && parts.first().is_some_and(Vec::is_empty) {
            parts.remove(0);
        }
        Ok(parts)
    }
}

impl<W: AsyncWriteExt + Unpin> ZmtpWriter<W> {
    pub async fn send_multipart(&mut self, frames: &[Vec<u8>]) -> io::Result<()> {
        if self.socket_type == ZmqSocketType::Req {
            let flags = if frames.is_empty() { 0x00 } else { 0x01 };
            write_frame(&mut self.writer, flags, &[]).await?;
        }
        for (idx, frame) in frames.iter().enumerate() {
            let more = idx + 1 < frames.len();
            let flags = if more { 0x01 } else { 0x00 };
            write_frame(&mut self.writer, flags, frame).await?;
        }
        self.writer.flush().await
    }
}

fn build_ready_command(socket_type: ZmqSocketType, identity: Option<&[u8]>) -> Vec<u8> {
    let mut buf = Vec::with_capacity(64);
    buf.push(5);
    buf.extend_from_slice(b"READY");
    push_property(&mut buf, "Socket-Type", socket_type.as_zmtp_str().as_bytes());
    if let Some(id) = identity {
        if matches!(socket_type, ZmqSocketType::Dealer | ZmqSocketType::Req) && !id.is_empty() {
            push_property(&mut buf, "Identity", id);
        }
    }
    buf
}

fn push_property(buf: &mut Vec<u8>, name: &str, value: &[u8]) {
    buf.push(name.len() as u8);
    buf.extend_from_slice(name.as_bytes());
    buf.extend_from_slice(&(value.len() as u32).to_be_bytes());
    buf.extend_from_slice(value);
}

async fn write_frame<W: AsyncWriteExt + Unpin>(
    writer: &mut W,
    base_flags: u8,
    payload: &[u8],
) -> io::Result<()> {
    if payload.len() <= 255 {
        let header = [base_flags, payload.len() as u8];
        writer.write_all(&header).await?;
    } else {
        let flags = base_flags | 0x02;
        writer.write_u8(flags).await?;
        writer.write_u64(payload.len() as u64).await?;
    }
    if !payload.is_empty() {
        writer.write_all(payload).await?;
    }
    Ok(())
}

async fn read_raw_frame<R: AsyncReadExt + Unpin>(reader: &mut R) -> io::Result<(u8, Vec<u8>)> {
    let flags = reader.read_u8().await?;
    let is_long = (flags & 0x02) != 0;
    let len = if is_long {
        let n = reader.read_u64().await?;
        if n > 256 * 1024 * 1024 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("trame ZMTP démesurée ({n} octets)"),
            ));
        }
        n as usize
    } else {
        reader.read_u8().await? as usize
    };
    let mut buf = vec![0u8; len];
    if len > 0 {
        reader.read_exact(&mut buf).await?;
    }
    Ok((flags, buf))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::TcpListener;

    #[tokio::test]
    async fn dealer_router_multipart_with_long_frames() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap().to_string();

        let server = tokio::spawn(async move {
            let (tcp, _) = listener.accept().await.unwrap();
            let mut router = ZmtpSocket::from_accepted(tcp, ZmqSocketType::Router, None)
                .await
                .unwrap();
            let received = router.recv_multipart().await.unwrap();
            assert_eq!(received.len(), 3);
            assert_eq!(received[0], b"<IDS|MSG>");
            assert_eq!(received[2].len(), 1024);
            router
                .send_multipart(&[b"ok".to_vec(), vec![42u8; 600]])
                .await
                .unwrap();
        });

        let mut dealer = ZmtpSocket::connect(&addr, ZmqSocketType::Dealer, Some(b"atelier-1"))
            .await
            .unwrap();
        dealer
            .send_multipart(&[b"<IDS|MSG>".to_vec(), b"hdr".to_vec(), vec![7u8; 1024]])
            .await
            .unwrap();
        let reply = dealer.recv_multipart().await.unwrap();
        assert_eq!(reply[0], b"ok");
        assert_eq!(reply[1].len(), 600);
        server.await.unwrap();
    }
}
