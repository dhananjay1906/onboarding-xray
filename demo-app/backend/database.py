from sqlmodel import Session, SQLModel, create_engine

engine = create_engine(
    "sqlite:///./store.db", connect_args={"check_same_thread": False}
)


def init_db(db_engine=engine) -> None:
    SQLModel.metadata.create_all(db_engine)


def get_session():
    with Session(engine) as session:
        yield session
