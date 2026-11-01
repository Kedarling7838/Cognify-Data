import oracledb
from getpass import getpass

oracledb.init_oracle_client(
    lib_dir=r"C:\Users\Asus\Downloads\instantclient-basic-windows.x64-23.26.4.0.0\instantclient_23_26"
)

username = input("Oracle username: ").strip()
password = getpass("Oracle password: ")

try:
    connection = oracledb.connect(
        user=username,
        password=password,
        dsn="127.0.0.1:1521/XE"
    )

    print("\nOracle connection successful!")

    cursor = connection.cursor()
    cursor.execute("SELECT USER FROM DUAL")

    print("Connected user:", cursor.fetchone()[0])

    cursor.execute(
        "SELECT TABLE_NAME FROM USER_TABLES ORDER BY TABLE_NAME"
    )

    print("\nAvailable tables:")
    for row in cursor.fetchall():
        print("-", row[0])

    cursor.close()
    connection.close()

except oracledb.Error as error:
    print("\nOracle connection failed:")
    print(error)
