mod gallery_tool;

fn main() {
    std::process::exit(gallery_tool::run(std::env::args().skip(1).collect()));
}
