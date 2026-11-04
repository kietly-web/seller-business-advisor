-- withShopContext runs SET LOCAL ROLE; the connecting role must be a member (SET TRUE is the default for role grants in PG16+)
GRANT sa_app, sa_worker TO CURRENT_USER;
